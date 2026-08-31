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
 * One Sync button: Shopify → abandoned → Delhivery → queues.
 * Does not auto-run on page load.
 */
export function CommerceSyncBar() {
  const { busy, beginSync, endSync, activeSync } = useCommerceSync();
  const syncing = busy && activeSync === "all";
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
      setStatus("Stuck sync lock + sync cursors cleared. Sync starts fresh from the top.");
      await refreshMeta();
    } finally {
      setLocalAction("idle");
    }
  }

  async function handleSync() {
    if (controlsBusy) return;
    const started = beginSync("all");
    if (!started) {
      setError("A sync is already in progress in this tab.");
      return;
    }

    const lockTokenRef = { current: started };
    setError(null);
    setStatus("Starting sync — Shopify orders, then abandoned checkouts, then Delhivery…");

    const retryOpts = {
      getToken: () => lockTokenRef.current,
      setToken: (t: string) => {
        lockTokenRef.current = t;
      },
      onRetry: (attempt: number, maxAttempts: number) => {
        setError(null);
        setStatus(
          `Server timed out on this batch — unlocking and retrying ${attempt}/${maxAttempts}…`,
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
          setStatus(
            "Stopped after automatic retries — use Clear stuck lock only if still locked.",
          );
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
          setStatus("Stopped — Shopify reported errors. Check diagnostics, then Sync again.");
          return;
        }
        if (!res.data.hasMore) break;
        cursor = res.data.nextCursor ?? null;
        if (!cursor) break;
      }

      if (shopifyTotal.hasMore || !shopifyTotal.complete) {
        setStatus(
          `${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)} — more remain. ` +
            "Click Sync again — it resumes automatically.",
        );
        return;
      }

      setStatus("Shopify orders done — loading abandoned checkouts…");
      let abandonedCursor: string | null = null;
      let abandonedTotal = emptyShopifyAbandonedSyncSummary();
      guard = 0;

      while (guard < 400) {
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
      // null = load saved resume offset (do not restart at 0).
      let offset: number | null = null;
      let delhiveryTotal = emptyDelhiverySyncSummary();
      guard = 0;

      while (guard < 400) {
        guard += 1;
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
        const through = res.data.complete
          ? (res.data.uniqueAwbsTracked || delhiveryTotal.awbsProcessed || 0)
          : (res.data.nextOffset ?? delhiveryTotal.awbsProcessed ?? 0);
        setStatus(
          `${formatAwbsTracked(through, delhiveryTotal.uniqueAwbsTracked || null)}` +
            (res.data.hasMore ? "…" : " — Delhivery done"),
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
          `Done — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}, ` +
            `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}, ` +
            `${formatAwbsTracked(delhiveryTotal.awbsProcessed ?? 0, delhiveryTotal.uniqueAwbsTracked || null)}. Queue rebuild failed.`,
        );
      } else {
        setStatus(
          `Done — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}, ` +
            `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}, ` +
            `${formatAwbsTracked(delhiveryTotal.awbsProcessed ?? 0, delhiveryTotal.uniqueAwbsTracked || null)}, ` +
            `queues: ${queues.data.deliveryCandidates} delivery · ` +
            `${queues.data.reengagementCandidates} re-engagement.`,
        );
      }
    } catch (err) {
      setError(formatCommerceSyncFailure(err));
      setStatus("Stopped — Sync will auto-retry timeouts; Clear stuck lock only for a hard reset.");
    } finally {
      await endSync(lockTokenRef.current);
      await refreshMeta();
    }
  }

  return (
    <FormSection
      title="Commerce sync"
      description="One Sync: new Shopify orders → abandoned checkouts → Delhivery tracking → call queues. Progress shows Loaded X of Y. Nothing runs on page load."
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
        <p
          className="text-sm text-charcoal/55 mb-3 inline-flex items-center gap-2"
          data-testid="commerce-sync-counts-loading"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading saved commerce counts…
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3" data-testid="commerce-sync-bar">
        <button
          type="button"
          data-testid="sync-all-commerce"
          onClick={() => void handleSync()}
          disabled={controlsBusy}
          aria-busy={syncing}
          className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Layers className="h-4 w-4" aria-hidden />
          )}
          {syncing ? "Syncing…" : "Sync"}
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
          {localAction === "refreshing" ? "Refreshing…" : "Refresh counts"}
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
          {localAction === "clearing" ? "Clearing lock…" : "Clear stuck lock"}
        </button>
        {!busy && serverLocked ? (
          <StatusChip label="Server lock held" tone="danger" />
        ) : null}
        {!busy && !serverLocked && localAction === "idle" ? (
          <StatusChip label="Ready" tone="success" />
        ) : null}
      </div>

      {syncing || localAction !== "idle" || status ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-soft-beige/60 px-3 py-2.5"
          data-testid="commerce-sync-progress"
          role="status"
          aria-live="polite"
        >
          {syncing || localAction !== "idle" ? (
            <Hourglass className="h-4 w-4 mt-0.5 shrink-0 text-deep-navy animate-pulse" aria-hidden />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-medium text-deep-navy">
              {syncing
                ? "Sync in progress"
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
          {syncing ? (
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
