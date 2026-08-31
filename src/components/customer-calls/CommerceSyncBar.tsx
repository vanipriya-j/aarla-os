"use client";

import { useCallback, useEffect, useState } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";
import {
  clearCommerceSyncLockViaApi,
  getCommerceSyncLockViaApi,
  syncDelhiveryChunkViaApi,
  syncShopifyAbandonedChunkViaApi,
  syncShopifyChunkViaApi,
} from "@/lib/client/commerce-sync-api";
import { runChunkWithAutoRetry } from "@/lib/client/commerce-sync-auto-retry";
import {
  emptyShopifyAbandonedSyncSummary,
  emptyShopifySyncSummary,
  mergeShopifyAbandonedSyncSummaries,
  mergeShopifySyncSummaries,
} from "@/lib/domain/external-commerce-types";
import {
  emptyDelhiverySyncSummary,
  mergeDelhiverySyncSummaries,
} from "@/lib/domain/shipment-types";
import { formatCommerceSyncFailure } from "@/lib/client/commerce-sync-errors";
import {
  formatAwbsTracked,
  formatCheckoutsLoaded,
  formatOrdersLoaded,
} from "@/lib/client/commerce-sync-progress";
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
      setStatus("Stuck sync lock + sync cursor cleared. Full re-sync starts from the top.");
      await refreshMeta();
    } finally {
      setLocalAction("idle");
    }
  }

  async function handleSyncAll() {
    if (controlsBusy) return;
    const started = beginSync("all");
    if (!started) {
      setError("A sync is already in progress in this tab.");
      return;
    }

    const lockTokenRef = { current: started };
    setError(null);
    setStatus("Click received — incremental Shopify sync (new orders only)…");

    const retryOpts = {
      getToken: () => lockTokenRef.current,
      setToken: (t: string) => {
        lockTokenRef.current = t;
      },
      onRetry: (attempt: number, maxAttempts: number) => {
        setError(null);
        setStatus(
          `Sync interrupted — unlocking and retrying ${attempt}/${maxAttempts}…`,
        );
      },
    };

    try {
      let cursor: string | null = null;
      let shopifyTotal = emptyShopifySyncSummary();
      let guard = 0;
      const maxChunks = 400;

      setStatus("Asking Shopify how many orders to load…");
      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          shopifyTotal.ordersTotal != null
            ? `${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}…`
            : shopifyTotal.ordersRead > 0
              ? `${formatOrdersLoaded(shopifyTotal.ordersRead)}…`
              : "Loading Shopify orders…",
        );
        const res = await runChunkWithAutoRetry({
          ...retryOpts,
          attempt: (token) => syncShopifyChunkViaApi(cursor, token, "incremental"),
        });
        if (!res.ok) {
          setError(res.error);
          setStatus("Stopped after automatic retries — use Clear stuck sync lock only if still locked.");
          return;
        }
        shopifyTotal = mergeShopifySyncSummaries(shopifyTotal, res.data);
        const since = shopifyTotal.incrementalFrom
          ? ` (new since ${new Date(shopifyTotal.incrementalFrom).toLocaleString()})`
          : "";
        setStatus(
          `${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}${since}` +
            (res.data.hasMore ? "…" : " — Shopify done"),
        );
        if (res.data.errors.length && !res.data.complete) {
          setError(res.data.errors.slice(0, 3).join(" · "));
          setStatus("Stopped — Shopify reported errors. Check Diagnostics, then Sync All again.");
          return;
        }
        if (!res.data.hasMore) break;
        cursor = res.data.nextCursor ?? null;
        if (!cursor) break;
      }

      if (shopifyTotal.hasMore || !shopifyTotal.complete) {
        setStatus(
          `${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)} — more remain. ` +
            "Click Sync All again — it resumes automatically.",
        );
        return;
      }

      setStatus("Shopify orders done — loading abandoned checkouts…");
      let abandonedCursor: string | null = null;
      let abandonedTotal = emptyShopifyAbandonedSyncSummary();
      guard = 0;
      const abandonedMaxChunks = 400;

      while (guard < abandonedMaxChunks) {
        guard += 1;
        setStatus(`${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}…`);
        const res = await runChunkWithAutoRetry({
          ...retryOpts,
          attempt: (token) =>
            syncShopifyAbandonedChunkViaApi(abandonedCursor, token, "incremental"),
        });
        if (!res.ok) {
          setError(res.error);
          setStatus("Stopped during abandoned checkouts after automatic retries.");
          return;
        }
        abandonedTotal = mergeShopifyAbandonedSyncSummaries(abandonedTotal, res.data);
        setStatus(
          `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}` +
            (res.data.hasMore ? "…" : " — abandoned checkouts done"),
        );
        if (!res.data.hasMore) break;
        abandonedCursor = res.data.nextCursor ?? null;
        if (!abandonedCursor) break;
      }

      setStatus("Abandoned checkouts done — tracking Delhivery AWBs…");
      let offset: number | null = 0;
      let delhiveryTotal = emptyDelhiverySyncSummary();
      guard = 0;
      const delhiveryMaxChunks = 400;

      while (guard < delhiveryMaxChunks) {
        guard += 1;
        const of = delhiveryTotal.uniqueAwbsTracked || null;
        setStatus(
          `${formatAwbsTracked(delhiveryTotal.awbsProcessed ?? 0, of || null)}…`,
        );
        const res = await runChunkWithAutoRetry({
          ...retryOpts,
          attempt: (token) => syncDelhiveryChunkViaApi(offset, token),
        });
        if (!res.ok) {
          setError(res.error);
          setStatus("Stopped during Delhivery after automatic retries.");
          return;
        }
        delhiveryTotal = mergeDelhiverySyncSummaries(delhiveryTotal, res.data);
        setStatus(
          `${formatAwbsTracked(
            delhiveryTotal.awbsProcessed ?? 0,
            delhiveryTotal.uniqueAwbsTracked || null,
          )}` + (res.data.hasMore ? "…" : " — Delhivery done"),
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
          `Done — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}` +
            `${shopifyTotal.mode === "incremental" ? " (incremental)" : " (full)"}, ` +
            `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}, ` +
            `${formatAwbsTracked(delhiveryTotal.awbsProcessed ?? 0, delhiveryTotal.uniqueAwbsTracked || null)}. Queue rebuild failed.`,
        );
      } else {
        setStatus(
          `Done — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}` +
            `${shopifyTotal.mode === "incremental" ? " (incremental)" : " (full)"}, ` +
            `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}, ` +
            `${formatAwbsTracked(delhiveryTotal.awbsProcessed ?? 0, delhiveryTotal.uniqueAwbsTracked || null)}, ` +
            `queues: ${queues.data.deliveryCandidates} delivery · ` +
            `${queues.data.reengagementCandidates} re-engagement.`,
        );
      }
    } catch (err) {
      setError(formatCommerceSyncFailure(err));
      setStatus("Stopped — Sync All will auto-retry timeouts; Clear lock only for a hard reset.");
    } finally {
      await endSync(lockTokenRef.current);
      await refreshMeta();
    }
  }

  async function handleFullShopifyResync() {
    if (controlsBusy) return;
    const started = beginSync("shopify");
    if (!started) {
      setError("A sync is already in progress in this tab.");
      return;
    }

    const lockTokenRef = { current: started };
    setError(null);
    setStatus("Click received — full Shopify re-sync (entire catalog)…");

    const retryOpts = {
      getToken: () => lockTokenRef.current,
      setToken: (t: string) => {
        lockTokenRef.current = t;
      },
      onRetry: (attempt: number, maxAttempts: number) => {
        setError(null);
        setStatus(
          `Full re-sync interrupted — unlocking and retrying ${attempt}/${maxAttempts}…`,
        );
      },
    };

    try {
      let cursor: string | null = null;
      let shopifyTotal = emptyShopifySyncSummary();
      let guard = 0;
      const maxChunks = 600;

      setStatus("Asking Shopify how many orders to load…");
      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          shopifyTotal.ordersTotal != null
            ? `Full re-sync — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}…`
            : shopifyTotal.ordersRead > 0
              ? `Full re-sync — ${formatOrdersLoaded(shopifyTotal.ordersRead)}…`
              : "Full re-sync — loading Shopify orders…",
        );
        const res = await runChunkWithAutoRetry({
          ...retryOpts,
          attempt: (token) => syncShopifyChunkViaApi(cursor, token, "full"),
        });
        if (!res.ok) {
          setError(res.error);
          setStatus("Stopped after automatic retries — Clear stuck sync lock only for a hard reset.");
          return;
        }
        shopifyTotal = mergeShopifySyncSummaries(shopifyTotal, res.data);
        setStatus(
          `Full re-sync — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}` +
            (res.data.hasMore ? "…" : " — full Shopify done"),
        );
        if (res.data.errors.length && !res.data.complete) {
          setError(res.data.errors.slice(0, 3).join(" · "));
          setStatus("Stopped — Shopify reported errors during full re-sync.");
          return;
        }
        if (!res.data.hasMore) break;
        cursor = res.data.nextCursor ?? null;
        if (!cursor) break;
      }

      if (shopifyTotal.hasMore || !shopifyTotal.complete) {
        setStatus(
          `Full re-sync — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)} — more remain. ` +
            "Click Full re-sync again — it resumes from where it left off.",
        );
        return;
      }

      setStatus(
        `Full re-sync — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)} (complete) · ` +
          "loading abandoned checkouts…",
      );

      let abandonedCursor: string | null = null;
      let abandonedTotal = emptyShopifyAbandonedSyncSummary();
      guard = 0;
      const abandonedMaxChunks = 600;

      while (guard < abandonedMaxChunks) {
        guard += 1;
        setStatus(
          `Full re-sync — ${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}…`,
        );
        const res = await runChunkWithAutoRetry({
          ...retryOpts,
          attempt: (token) =>
            syncShopifyAbandonedChunkViaApi(abandonedCursor, token, "full"),
        });
        if (!res.ok) {
          setError(res.error);
          setStatus("Stopped during abandoned checkouts after automatic retries.");
          return;
        }
        abandonedTotal = mergeShopifyAbandonedSyncSummaries(abandonedTotal, res.data);
        setStatus(
          `Full re-sync — ${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}` +
            (res.data.hasMore ? "…" : " — abandoned checkouts done"),
        );
        if (!res.data.hasMore) break;
        abandonedCursor = res.data.nextCursor ?? null;
        if (!abandonedCursor) break;
      }

      setStatus(
        `Full Shopify re-sync finished — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}` +
          `${shopifyTotal.complete ? " (complete)" : " (more remain)"}, ` +
          `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}` +
          `${abandonedTotal.complete ? " (complete)" : " (more remain)"}.`,
      );
    } catch (err) {
      setError(formatCommerceSyncFailure(err));
      setStatus("Stopped — Full re-sync auto-retries timeouts; Clear lock only for a hard reset.");
    } finally {
      await endSync(lockTokenRef.current);
      await refreshMeta();
    }
  }

  return (
    <FormSection
      title="Commerce sync"
      description="Nothing syncs on page load. One click runs until complete: Sync All (new Shopify → abandoned → Delhivery) or Full re-sync (whole catalog). Progress shows Loaded X of Y orders (and Tracked X of Y AWBs). Timeouts unlock and retry automatically. Use Clear stuck sync lock only for a hard reset."
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
