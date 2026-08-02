"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";
import {
  clearCommerceSyncLockViaApi,
  getCommerceSyncLockViaApi,
  syncDelhiveryChunkViaApi,
  syncShopifyChunkViaApi,
} from "@/lib/client/commerce-sync-api";
import {
  emptyShopifySyncSummary,
  mergeShopifySyncSummaries,
} from "@/lib/domain/external-commerce-types";
import {
  emptyDelhiverySyncSummary,
  mergeDelhiverySyncSummaries,
} from "@/lib/domain/shipment-types";
import { formatCommerceSyncFailure } from "@/lib/client/commerce-sync-errors";
import { Layers } from "lucide-react";

type CommerceCounts = {
  externalCustomers: number;
  externalOrders: number;
  externalFulfilments: number;
  fulfilmentsWithAwb: number;
  shipments: number;
};

/**
 * Serial Shopify → Delhivery sync. Does not auto-run on page load.
 */
export function CommerceSyncBar() {
  const { busy, beginSync, endSync, activeSync } = useCommerceSync();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<CommerceCounts | null>(null);
  const [serverLocked, setServerLocked] = useState(false);
  const [, startMetaTransition] = useTransition();

  const refreshMeta = useCallback(async () => {
    try {
      const [diagRes, lockRes] = await Promise.all([
        fetch("/api/diagnostics", { cache: "no-store" }),
        getCommerceSyncLockViaApi(),
      ]);
      if (diagRes.ok) {
        const body = (await diagRes.json()) as { commerce?: CommerceCounts };
        if (body.commerce) setCounts(body.commerce);
      }
      if (lockRes.ok) setServerLocked(lockRes.data.locked);
    } catch {
      /* non-fatal */
    }
  }, []);

  // Lightweight counts only — not a sync.
  useEffect(() => {
    startMetaTransition(() => {
      void refreshMeta();
    });
  }, [refreshMeta]);

  async function handleClearLock() {
    setError(null);
    const res = await clearCommerceSyncLockViaApi();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setServerLocked(false);
    setStatus("Stuck sync lock cleared. You can sync again.");
    await refreshMeta();
  }

  async function handleSyncAll() {
    const token = beginSync("all");
    if (!token) {
      setError("A sync is already in progress in this tab.");
      return;
    }

    setError(null);
    setStatus("Starting Shopify sync…");

    try {
      let cursor: string | null = null;
      let shopifyTotal = emptyShopifySyncSummary();
      let guard = 0;
      const maxChunks = 120;

      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          cursor
            ? `Shopify chunk ${guard} (continuing)…`
            : `Shopify chunk ${guard}…`,
        );
        let res;
        try {
          res = await syncShopifyChunkViaApi(cursor, token);
        } catch (err) {
          setError(formatCommerceSyncFailure(err));
          setStatus(null);
          return;
        }
        if (!res.ok) {
          setError(res.error);
          setStatus(null);
          return;
        }
        shopifyTotal = mergeShopifySyncSummaries(shopifyTotal, res.data);
        if (res.data.errors.length && !res.data.hasMore) {
          setError(res.data.errors.slice(0, 3).join(" · "));
        }
        if (!res.data.hasMore) break;
        cursor = res.data.nextCursor ?? null;
        if (!cursor) break;
      }

      setStatus("Starting Delhivery sync…");
      let offset: number | null = 0;
      let delhiveryTotal = emptyDelhiverySyncSummary();
      guard = 0;

      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          offset
            ? `Delhivery chunk ${guard} (offset ${offset})…`
            : `Delhivery chunk ${guard}…`,
        );
        let res;
        try {
          res = await syncDelhiveryChunkViaApi(offset, token);
        } catch (err) {
          setError(formatCommerceSyncFailure(err));
          setStatus(null);
          return;
        }
        if (!res.ok) {
          setError(res.error);
          setStatus(null);
          return;
        }
        delhiveryTotal = mergeDelhiverySyncSummaries(delhiveryTotal, res.data);
        if (!res.data.hasMore) break;
        offset = res.data.nextOffset ?? null;
        if (offset == null) break;
      }

      setStatus(
        `Done — Shopify ${shopifyTotal.ordersRead} orders read` +
          `${shopifyTotal.complete ? " (complete)" : " (more remain)"}, ` +
          `Delhivery ${delhiveryTotal.awbsProcessed ?? 0} AWBs` +
          `${delhiveryTotal.complete ? " (complete)" : " (more remain)"}.`,
      );
    } catch (err) {
      setError(formatCommerceSyncFailure(err));
      setStatus(null);
    } finally {
      await endSync(token);
      await refreshMeta();
    }
  }

  return (
    <FormSection
      title="Commerce sync"
      description="Nothing syncs on page load. Shopify runs first, then Delhivery. If a request times out, clear the lock and click Sync again — saved rows are kept."
    >
      {counts ? (
        <p
          className="text-sm text-charcoal/70 mb-3"
          data-testid="commerce-sync-counts"
        >
          In database now: {counts.externalCustomers} customers ·{" "}
          {counts.externalOrders} orders · {counts.externalFulfilments} fulfilments ·{" "}
          {counts.fulfilmentsWithAwb} AWBs · {counts.shipments} shipments
        </p>
      ) : (
        <p className="text-sm text-charcoal/55 mb-3" data-testid="commerce-sync-counts-loading">
          Loading saved commerce counts…
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3" data-testid="commerce-sync-bar">
        <button
          type="button"
          data-testid="sync-all-commerce"
          onClick={() => void handleSyncAll()}
          disabled={busy}
          className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
        >
          <Layers className="h-4 w-4" />
          Sync All (Shopify → Delhivery)
        </button>
        <button
          type="button"
          data-testid="refresh-commerce-counts"
          onClick={() => void refreshMeta()}
          disabled={busy}
          className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-60"
        >
          Refresh DB counts
        </button>
        <button
          type="button"
          data-testid="clear-commerce-sync-lock"
          onClick={() => void handleClearLock()}
          disabled={busy}
          className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-60"
        >
          Clear stuck sync lock
        </button>
        {busy && activeSync === "all" ? (
          <StatusChip label="Syncing…" tone="neutral" />
        ) : null}
        {busy && activeSync !== "all" ? (
          <StatusChip label={`Busy: ${activeSync}`} tone="neutral" />
        ) : null}
        {!busy && serverLocked ? (
          <StatusChip label="Server lock held" tone="danger" />
        ) : null}
        {status ? (
          <span className="text-sm text-charcoal/65" data-testid="commerce-sync-status">
            {status}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-aarla-red mt-3" data-testid="commerce-sync-error">
          {error}
        </p>
      ) : null}
    </FormSection>
  );
}
