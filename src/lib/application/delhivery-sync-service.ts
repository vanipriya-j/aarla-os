import type { DelhiveryConnector } from "@/lib/adapters/delhivery/port";
import {
  chunkAwbs,
  dedupeAwbs,
  isDelhiveryCarrier,
  normalizeAwb,
} from "@/lib/adapters/delhivery/normalize";
import { createLiveDelhiveryConnectorFromEnv } from "@/lib/adapters/delhivery/live-tracking-connector";
import { FixtureDelhiveryConnector } from "@/lib/adapters/delhivery/fixture-connector";
import { createShipmentRepository } from "@/lib/infra/repositories/postgres-shipments";
import type {
  FulfilmentTrackingRow,
  ShipmentRepository,
} from "@/lib/repositories/shipments";
import {
  emptyDelhiverySyncSummary,
  tallyNormalizedStatus,
  type DelhiverySyncSummary,
  type ShipmentDiagnosticsPage,
} from "@/lib/domain/shipment-types";
import { ConfigurationError } from "@/lib/infra/db/errors";

export type SyncDelhiveryDeps = {
  connector?: DelhiveryConnector;
  repo?: ShipmentRepository;
  /** Resume offset into the deduped AWB list */
  offset?: number;
  /** Max AWBs to track per invocation (default 10) */
  maxAwbs?: number;
};

function resolveConnector(deps: SyncDelhiveryDeps): DelhiveryConnector {
  if (deps.connector) return deps.connector;
  // Opt-in fixture mode for local/e2e — never enabled in production by default.
  if (process.env.DELHIVERY_USE_FIXTURE === "1") {
    return new FixtureDelhiveryConnector();
  }
  const live = createLiveDelhiveryConnectorFromEnv();
  if (!live) {
    throw new ConfigurationError(
      "Delhivery credentials missing. Set DELHIVERY_API_TOKEN on the server.",
    );
  }
  return live;
}

function defaultMaxAwbs(): number {
  const raw = process.env.DELHIVERY_SYNC_MAX_AWBS?.trim();
  const n = raw ? Number(raw) : 10;
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(Math.floor(n), 30);
}

type AwbLink = {
  awb: string;
  rows: FulfilmentTrackingRow[];
  ambiguous: boolean;
};

function buildAwbLinks(fulfilments: FulfilmentTrackingRow[]): {
  evaluated: number;
  delhiveryFound: number;
  skipped: number;
  links: AwbLink[];
} {
  let evaluated = 0;
  let delhiveryFound = 0;
  let skipped = 0;
  const byAwb = new Map<string, FulfilmentTrackingRow[]>();

  for (const row of fulfilments) {
    evaluated += 1;
    if (!isDelhiveryCarrier(row.trackingCompany, row.trackingUrl)) {
      skipped += 1;
      continue;
    }
    const awb = normalizeAwb(row.trackingNumber);
    if (!awb) {
      skipped += 1;
      continue;
    }
    delhiveryFound += 1;
    const list = byAwb.get(awb) ?? [];
    list.push(row);
    byAwb.set(awb, list);
  }

  const links: AwbLink[] = [...byAwb.entries()].map(([awb, rows]) => ({
    awb,
    rows,
    ambiguous: rows.length > 1,
  }));

  return { evaluated, delhiveryFound, skipped, links };
}

/**
 * Sync Delhivery tracking for AWBs from Shopify fulfilments.
 * Chunked for Vercel timeouts — pass `offset` from the previous summary to continue.
 * Does not create Customer Call queue items or mutate Shopify sync tables.
 */
export async function syncDelhiveryShipments(
  deps: SyncDelhiveryDeps = {},
): Promise<DelhiverySyncSummary> {
  const summary = emptyDelhiverySyncSummary();
  const repo = deps.repo ?? createShipmentRepository();
  const connector = resolveConnector(deps);
  const offset = Math.max(0, Math.floor(deps.offset ?? 0));
  const maxAwbs = deps.maxAwbs ?? defaultMaxAwbs();

  const fulfilments = await repo.listFulfilmentsWithOrders();
  const { evaluated, delhiveryFound, skipped, links } = buildAwbLinks(fulfilments);
  summary.fulfilmentsEvaluated = evaluated;
  summary.delhiveryAwbsFound = delhiveryFound;
  summary.skippedRecords = skipped;
  summary.ambiguousAwbLinkages = links.filter((l) => l.ambiguous).length;

  const awbs = dedupeAwbs(links.map((l) => l.awb)).sort();
  summary.uniqueAwbsTracked = awbs.length;

  if (!awbs.length) {
    summary.awbsProcessed = 0;
    summary.hasMore = false;
    summary.nextOffset = null;
    summary.complete = true;
    return summary;
  }

  const slice = awbs.slice(offset, offset + maxAwbs);
  summary.awbsProcessed = slice.length;
  const nextOffset = offset + slice.length;
  const hasMore = nextOffset < awbs.length;
  summary.hasMore = hasMore;
  summary.nextOffset = hasMore ? nextOffset : null;
  summary.complete = !hasMore;

  if (!slice.length) {
    return summary;
  }

  const linkByAwb = new Map(links.map((l) => [l.awb, l]));
  let tracked;

  try {
    tracked = [];
    for (const batch of chunkAwbs(slice, 30)) {
      tracked.push(...(await connector.trackShipments(batch)));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delhivery fetch failed";
    summary.errors.push(message);
    summary.failedLookups += slice.length;
    for (const awb of slice) {
      await repo.markSyncFailure("delhivery", awb, "error", message);
    }
    return summary;
  }

  for (const result of tracked) {
    const link = linkByAwb.get(result.awb);
    const primary = link?.rows[0];
    const orderId = link?.ambiguous
      ? // only link order if all rows share the same order
        link.rows.every((r) => r.orderId === primary?.orderId)
        ? primary?.orderId ?? null
        : null
      : primary?.orderId ?? null;
    const fulfilmentId = link?.ambiguous ? null : primary?.fulfilmentId ?? null;

    const ok = result.syncStatus === "ok";
    if (!ok) {
      summary.failedLookups += 1;
      if (result.error) summary.errors.push(`${result.awb}: ${result.error}`);
    }

    try {
      const existing = await repo.findByCarrierAwb("delhivery", result.awb);
      const upsert = await repo.upsertShipment({
        carrier: "delhivery",
        awb: result.awb,
        externalOrderId: orderId,
        externalFulfilmentId: fulfilmentId,
        providerStatus: result.providerStatus ?? null,
        providerStatusType: result.providerStatusType ?? null,
        normalizedStatus: result.normalizedStatus,
        deliveredAt: result.deliveredAt ?? null,
        latestScanAt: result.latestScanAt ?? null,
        latestScanLocation: result.latestScanLocation ?? null,
        syncStatus: result.syncStatus,
        syncError: result.error ?? null,
        rawProviderPayload: result.rawProviderPayload,
        applyTrackingUpdate: ok,
      });

      if (upsert.created) summary.shipmentsCreated += 1;
      else summary.shipmentsUpdated += 1;

      const statusForTally = ok
        ? upsert.shipment.normalizedStatus
        : existing?.normalizedStatus ?? upsert.shipment.normalizedStatus;
      if (ok) tallyNormalizedStatus(summary, statusForTally);

      if (ok && result.scans?.length) {
        await repo.appendStatusEvents({
          shipmentId: upsert.id,
          awb: result.awb,
          scans: result.scans,
        });
      }
    } catch (err) {
      summary.failedLookups += 1;
      summary.errors.push(
        `${result.awb}: ${err instanceof Error ? err.message : "persist failed"}`,
      );
    }
  }

  return summary;
}

export async function getDelhiveryShipmentDiagnostics(
  deps: {
    repo?: ShipmentRepository;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<ShipmentDiagnosticsPage> {
  const repo = deps.repo ?? createShipmentRepository();
  return repo.listDiagnostics({ page: deps.page, pageSize: deps.pageSize });
}
