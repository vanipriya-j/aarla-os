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
  type ShipmentDiagnosticSort,
  type ShipmentDiagnosticsPage,
} from "@/lib/domain/shipment-types";
import { ConfigurationError } from "@/lib/infra/db/errors";
import {
  getDelhiveryResumeOffset,
  saveDelhiveryResumeOffset,
} from "@/lib/application/commerce-sync-watermarks";

export type SyncDelhiveryDeps = {
  connector?: DelhiveryConnector;
  repo?: ShipmentRepository;
  /**
   * Resume offset into the deduped AWB list.
   * Pass null/undefined to load the saved resume offset (or start at 0).
   * Pass an explicit number to continue a multi-chunk client loop.
   */
  offset?: number | null;
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
  // Default 10 AWBs/chunk — list+track+upsert must finish inside Vercel ~60s
  // (remote Supabase RTT; was 25 and still timed out on ~300 AWBs).
  const n = raw ? Number(raw) : 10;
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(Math.floor(n), 25);
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
  const maxAwbs = deps.maxAwbs ?? defaultMaxAwbs();

  let offset: number;
  if (deps.offset == null) {
    offset = (await getDelhiveryResumeOffset()) ?? 0;
  } else {
    offset = Math.max(0, Math.floor(deps.offset));
  }

  const fulfilments = await repo.listFulfilmentsWithOrders();
  const { evaluated, delhiveryFound, skipped, links } = buildAwbLinks(fulfilments);
  summary.fulfilmentsEvaluated = evaluated;
  summary.delhiveryAwbsFound = delhiveryFound;
  summary.skippedRecords = skipped;
  summary.ambiguousAwbLinkages = links.filter((l) => l.ambiguous).length;

  const awbs = dedupeAwbs(links.map((l) => l.awb)).sort();
  summary.uniqueAwbsTracked = awbs.length;

  // If the AWB list shrank (fulfilments removed), clamp resume past the end.
  if (offset > awbs.length) offset = 0;

  if (!awbs.length) {
    summary.awbsProcessed = 0;
    summary.hasMore = false;
    summary.nextOffset = null;
    summary.complete = true;
    await saveDelhiveryResumeOffset(null);
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
    await saveDelhiveryResumeOffset(null);
    return summary;
  }

  const linkByAwb = new Map(links.map((l) => [l.awb, l]));
  let tracked;

  try {
    tracked = [];
    // Small API batches: Delhivery often returns a batch-level "does not exist"
    // error with no ShipmentData — keep batches tight so one bad group can't
    // burn a whole chunk's wall clock.
    for (const batch of chunkAwbs(slice, 10)) {
      tracked.push(...(await connector.trackShipments(batch)));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delhivery fetch failed";
    summary.errors.push(message);
    summary.failedLookups += slice.length;
    for (const awb of slice) {
      await repo.markSyncFailure("delhivery", awb, "error", message);
    }
    await saveDelhiveryResumeOffset(hasMore ? nextOffset : null);
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
      const upsert = await repo.upsertShipment({
        carrier: "delhivery",
        awb: result.awb,
        externalOrderId: orderId,
        externalFulfilmentId: fulfilmentId,
        providerStatus: result.providerStatus ?? null,
        providerStatusType: result.providerStatusType ?? null,
        normalizedStatus: result.normalizedStatus,
        deliveredAt: result.deliveredAt ?? null,
        promisedDeliveryAt: result.promisedDeliveryAt ?? null,
        latestScanAt: result.latestScanAt ?? null,
        latestScanLocation: result.latestScanLocation ?? null,
        syncStatus: result.syncStatus,
        syncError: result.error ?? null,
        rawProviderPayload: result.rawProviderPayload,
        applyTrackingUpdate: ok,
      });

      if (upsert.created) summary.shipmentsCreated += 1;
      else summary.shipmentsUpdated += 1;

      if (ok) tallyNormalizedStatus(summary, upsert.shipment.normalizedStatus);

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

  // Persist resume so the next click continues instead of restarting at 0.
  await saveDelhiveryResumeOffset(hasMore ? nextOffset : null);

  return summary;
}

export async function getDelhiveryShipmentDiagnostics(
  deps: {
    repo?: ShipmentRepository;
    page?: number;
    pageSize?: number;
    sort?: ShipmentDiagnosticSort;
  } = {},
): Promise<ShipmentDiagnosticsPage> {
  const repo = deps.repo ?? createShipmentRepository();
  return repo.listDiagnostics({
    page: deps.page,
    pageSize: deps.pageSize,
    sort: deps.sort,
  });
}
