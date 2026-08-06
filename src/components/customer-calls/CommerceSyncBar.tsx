"use client";

import { useCallback, useEffect, useState } from "react";
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
import { refreshCustomerCallQueuesAction } from "@/app/actions/customer-calls-actions";
import { Hourglass, Layers, Loader2, RefreshCw, Unlock } from "lucide-react";

type CommerceCounts = {
  externalCustomers: number;
  externalOrders: number;
  externalFulfilments: number;
  fulfilmentsWithAwb: number;
  shipments: number;
};

type LocalAction = "idle" | "refreshing" | "clearing";

/**
 * Serial Shopify → Delhivery sync. Does not auto-run on page load.
 */
export function CommerceSyncBar() {
  const { busy, beginSync, endSync, activeSync } = useCommerceSync();
  const syncingAll = busy && activeSync === "all";
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<CommerceCounts | null>(null);
  const [serverLocked, setServerLocked] = useState(false);
  const [localAction, setLocalAction] = useState<LocalAction>("idle");

  const controlsBusy = busy || localAction !== "idle";

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
    let cancelled = false;
    void (async () => {
      await refreshMeta();
      if (cancelled) return;
      setCounts((prev) =>
        prev ?? {
          externalCustomers: 0,
          externalOrders: 0,
          externalFulfilments: 0,
          fulfilmentsWithAwb: 0,
          shipments: 0,
        },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMeta]);

  async function handleRefreshCounts() {
    if (controlsBusy) return;
    setLocalAction("refreshing");
    setError(null);
    setStatus("Refreshing database counts…");
    try {
      await refreshMeta();
      setStatus("Counts updated.");
    } finally {
      setLocalAction("idle");
    }
  }

  async function handleClearLock() {
    if (controlsBusy) return;
    setLocalAction("clearing");
    setError(null);
    setStatus("Clearing stuck sync lock…");
    try {
      const res = await clearCommerceSyncLockViaApi();
      if (!res.ok) {
        setError(res.error);
        setStatus(null);
        return;
      }
      setServerLocked(false);
      setStatus("Stuck sync lock cleared. You can sync again.");
      await refreshMeta();
    } finally {
      setLocalAction("idle");
    }
  }

  async function handleSyncAll() {
    if (controlsBusy) return;
    const token = beginSync("all");
    if (!token) {
      setError("A sync is already in progress in this tab.");
      return;
    }

    setError(null);
    setStatus("Click received — incremental Shopify sync (new orders only)…");

    try {
      let cursor: string | null = null;
      let shopifyTotal = emptyShopifySyncSummary();
      let guard = 0;
      const maxChunks = 120;

      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          cursor
            ? `Working… Shopify chunk ${guard} (continuing)`
            : `Working… Shopify chunk ${guard}`,
        );
        let res;
        try {
          res = await syncShopifyChunkViaApi(cursor, token, "incremental");
        } catch (err) {
          setError(formatCommerceSyncFailure(err));
          setStatus("Stopped — clear the lock if needed, then try again.");
          return;
        }
        if (!res.ok) {
          setError(res.error);
          setStatus("Stopped — clear the lock if needed, then try again.");
          return;
        }
        shopifyTotal = mergeShopifySyncSummaries(shopifyTotal, res.data);
        const since = shopifyTotal.incrementalFrom
          ? ` since ${new Date(shopifyTotal.incrementalFrom).toLocaleString()}`
          : "";
        setStatus(
          `Shopify chunk ${guard} saved · ${shopifyTotal.ordersRead} new orders read${since}` +
            (res.data.hasMore ? " · more remaining…" : " · Shopify done"),
        );
        if (res.data.errors.length && !res.data.hasMore) {
          setError(res.data.errors.slice(0, 3).join(" · "));
        }
        if (!res.data.hasMore) break;
        cursor = res.data.nextCursor ?? null;
        if (!cursor) break;
      }

      setStatus("Shopify finished — tracking all Delhivery AWBs in the database…");
      let offset: number | null = 0;
      let delhiveryTotal = emptyDelhiverySyncSummary();
      guard = 0;
      // Separate budget from Shopify — full AWB backfill can need many chunks.
      const delhiveryMaxChunks = 200;

      while (guard < delhiveryMaxChunks) {
        guard += 1;
        setStatus(
          offset
            ? `Working… Delhivery chunk ${guard} (AWB offset ${offset})`
            : `Working… Delhivery chunk ${guard}`,
        );
        let res;
        try {
          res = await syncDelhiveryChunkViaApi(offset, token);
        } catch (err) {
          setError(formatCommerceSyncFailure(err));
          setStatus("Stopped during Delhivery — clear the lock if needed, then try again.");
          return;
        }
        if (!res.ok) {
          setError(res.error);
          setStatus("Stopped during Delhivery — clear the lock if needed, then try again.");
          return;
        }
        delhiveryTotal = mergeDelhiverySyncSummaries(delhiveryTotal, res.data);
        const done = delhiveryTotal.awbsProcessed ?? 0;
        const of = delhiveryTotal.uniqueAwbsTracked || "?";
        setStatus(
          `Delhivery ${done} / ${of} unique AWBs` +
            (res.data.hasMore ? " · more remaining…" : " · Delhivery done"),
        );
        if (!res.data.hasMore) break;
        offset = res.data.nextOffset ?? null;
        if (offset == null) break;
      }

      setStatus("Commerce sync done — rebuilding call queues…");
      const queues = await refreshCustomerCallQueuesAction();
      if (!queues.ok) {
        setError(queues.error);
        setStatus(
          `Done — Shopify ${shopifyTotal.ordersRead} orders` +
            `${shopifyTotal.mode === "incremental" ? " (incremental)" : " (full)"}, ` +
            `Delhivery ${delhiveryTotal.awbsProcessed ?? 0} AWBs. Queue rebuild failed.`,
        );
      } else {
        setStatus(
          `Done — Shopify ${shopifyTotal.ordersRead} orders` +
            `${shopifyTotal.mode === "incremental" ? " (incremental)" : " (full)"}, ` +
            `Delhivery ${delhiveryTotal.awbsProcessed ?? 0} AWBs, ` +
            `queues: ${queues.data.deliveryCandidates} delivery · ` +
            `${queues.data.reengagementCandidates} re-engagement.`,
        );
      }
    } catch (err) {
      setError(formatCommerceSyncFailure(err));
      setStatus("Stopped — clear the lock if needed, then try again.");
    } finally {
      await endSync(token);
      await refreshMeta();
    }
  }

  async function handleFullShopifyResync() {
    if (controlsBusy) return;
    const token = beginSync("shopify");
    if (!token) {
      setError("A sync is already in progress in this tab.");
      return;
    }

    setError(null);
    setStatus("Click received — full Shopify re-sync (entire catalog)…");

    try {
      let cursor: string | null = null;
      let shopifyTotal = emptyShopifySyncSummary();
      let guard = 0;
      const maxChunks = 200;

      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          cursor
            ? `Full re-sync… Shopify chunk ${guard} (continuing)`
            : `Full re-sync… Shopify chunk ${guard}`,
        );
        let res;
        try {
          res = await syncShopifyChunkViaApi(cursor, token, "full");
        } catch (err) {
          setError(formatCommerceSyncFailure(err));
          setStatus("Stopped — clear the lock if needed, then try again.");
          return;
        }
        if (!res.ok) {
          setError(res.error);
          setStatus("Stopped — clear the lock if needed, then try again.");
          return;
        }
        shopifyTotal = mergeShopifySyncSummaries(shopifyTotal, res.data);
        setStatus(
          `Full re-sync chunk ${guard} · ${shopifyTotal.ordersRead} orders read` +
            (res.data.hasMore ? " · more remaining…" : " · full Shopify done"),
        );
        if (!res.data.hasMore) break;
        cursor = res.data.nextCursor ?? null;
        if (!cursor) break;
      }

      setStatus(
        `Full Shopify re-sync finished — ${shopifyTotal.ordersRead} orders read` +
          `${shopifyTotal.complete ? " (complete)" : " (more remain)"}.`,
      );
    } catch (err) {
      setError(formatCommerceSyncFailure(err));
      setStatus("Stopped — clear the lock if needed, then try again.");
    } finally {
      await endSync(token);
      await refreshMeta();
    }
  }

  return (
    <FormSection
      title="Commerce sync"
      description="Nothing syncs on page load. Sync All pulls only new Shopify orders since last success, then tracks every Delhivery AWB already in the database (not just the last Shopify page). Use Full re-sync only when you need the whole catalog again."
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
        <p className="text-sm text-charcoal/55 mb-3 inline-flex items-center gap-2" data-testid="commerce-sync-counts-loading">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading saved commerce counts…
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3" data-testid="commerce-sync-bar">
        <button
          type="button"
          data-testid="sync-all-commerce"
          onClick={() => void handleSyncAll()}
          disabled={controlsBusy}
          aria-busy={syncingAll}
          className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
        >
          {syncingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Layers className="h-4 w-4" aria-hidden />
          )}
          {syncingAll ? "Syncing…" : "Sync All (new only → Delhivery)"}
        </button>
        <button
          type="button"
          data-testid="full-shopify-resync"
          onClick={() => void handleFullShopifyResync()}
          disabled={controlsBusy}
          aria-busy={busy && activeSync === "shopify"}
          className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-60"
        >
          {busy && activeSync === "shopify" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          {busy && activeSync === "shopify" ? "Full re-sync…" : "Full Shopify re-sync"}
        </button>
        <button
          type="button"
          data-testid="refresh-commerce-counts"
          onClick={() => void handleRefreshCounts()}
          disabled={controlsBusy}
          aria-busy={localAction === "refreshing"}
          className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${localAction === "refreshing" ? "animate-spin" : ""}`}
            aria-hidden
          />
          {localAction === "refreshing" ? "Refreshing…" : "Refresh DB counts"}
        </button>
        <button
          type="button"
          data-testid="clear-commerce-sync-lock"
          onClick={() => void handleClearLock()}
          disabled={controlsBusy}
          aria-busy={localAction === "clearing"}
          className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-60"
        >
          {localAction === "clearing" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Unlock className="h-4 w-4" aria-hidden />
          )}
          {localAction === "clearing" ? "Clearing lock…" : "Clear stuck sync lock"}
        </button>
        {busy && activeSync !== "all" ? (
          <StatusChip label={`Busy: ${activeSync}`} tone="neutral" />
        ) : null}
        {!busy && serverLocked ? (
          <StatusChip label="Server lock held" tone="danger" />
        ) : null}
        {!busy && !serverLocked && localAction === "idle" ? (
          <StatusChip label="Ready" tone="success" />
        ) : null}
      </div>

      {syncingAll || (busy && activeSync === "shopify") || localAction !== "idle" || status ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-soft-beige/60 px-3 py-2.5"
          data-testid="commerce-sync-progress"
          role="status"
          aria-live="polite"
        >
          {syncingAll || (busy && activeSync === "shopify") || localAction !== "idle" ? (
            <Hourglass className="h-4 w-4 mt-0.5 shrink-0 text-deep-navy animate-pulse" aria-hidden />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-medium text-deep-navy">
              {syncingAll
                ? "Sync in progress"
                : busy && activeSync === "shopify"
                  ? "Full Shopify re-sync"
                : localAction === "clearing"
                  ? "Clearing lock"
                  : localAction === "refreshing"
                    ? "Refreshing counts"
                    : "Last update"}
            </p>
            {status ? (
              <p className="text-sm text-charcoal/70 mt-0.5" data-testid="commerce-sync-status">
                {status}
              </p>
            ) : (
              <p className="text-sm text-charcoal/55 mt-0.5">Working — please wait…</p>
            )}
          </div>
          {syncingAll || (busy && activeSync === "shopify") ? (
            <Loader2 className="h-4 w-4 mt-0.5 ml-auto shrink-0 animate-spin text-deep-navy" aria-hidden />
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-aarla-red mt-3" data-testid="commerce-sync-error">
          {error}
        </p>
      ) : null}
    </FormSection>
  );
}
