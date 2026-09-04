"use client";

import { useCallback, useEffect, useState } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";
import {
  clearCommerceSyncLockViaApi,
  getCommerceSyncLockViaApi,
} from "@/lib/client/commerce-sync-api";
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
 * Job lives in CommerceSyncProvider so navigating away does not stop it.
 */
export function CommerceSyncBar() {
  const {
    busy,
    activeSync,
    status,
    error,
    startSyncAll,
    setStatus,
    setError,
  } = useCommerceSync();
  const syncing = busy && activeSync === "all";
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

  // Refresh DB counts when a shell job finishes.
  useEffect(() => {
    if (!busy) void refreshMeta();
  }, [busy, refreshMeta]);

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
      setStatus("Stuck sync lock + sync cursor cleared. Sync starts fresh from the top.");
      await refreshMeta();
    } finally {
      setLocalAction("idle");
    }
  }

  return (
    <FormSection
      title="Commerce sync"
      description="One Sync: new Shopify orders → abandoned checkouts → Delhivery tracking → call queues. Progress survives navigating to other pages in this tab. Closing the tab still stops the browser loop — click Sync again to resume. Nothing runs on page load."
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
          onClick={() => void startSyncAll()}
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
          title="Unlocks a stuck sync. Keeps the incremental order watermark so Sync All does not re-download full history."
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
