/**
 * Browser-orchestrated commerce sync jobs.
 * Live in the app shell so navigating away from Customer Calls does not kill the loop.
 */

import {
  syncDelhiveryChunkViaApi,
  syncShopifyAbandonedChunkViaApi,
  syncShopifyChunkViaApi,
} from "@/lib/client/commerce-sync-api";
import { runChunkWithAutoRetry } from "@/lib/client/commerce-sync-auto-retry";
import { formatCommerceSyncFailure } from "@/lib/client/commerce-sync-errors";
import {
  formatAwbsTracked,
  formatCheckoutsLoaded,
  formatOrdersLoaded,
} from "@/lib/client/commerce-sync-progress";
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
import { refreshCustomerCallQueuesAction } from "@/app/actions/customer-calls-actions";

export type CommerceSyncJobCallbacks = {
  getToken: () => string;
  setToken: (token: string) => void;
  setStatus: (status: string) => void;
  setError: (error: string | null) => void;
};

export async function runCommerceSyncAllJob(
  cb: CommerceSyncJobCallbacks,
): Promise<void> {
  const retryOpts = {
    getToken: cb.getToken,
    setToken: cb.setToken,
    onRetry: (attempt: number, maxAttempts: number) => {
      cb.setError(null);
      cb.setStatus(
        `Server timed out on this batch — unlocking and retrying ${attempt}/${maxAttempts}…`,
      );
    },
  };

  cb.setError(null);
  cb.setStatus("Click received — incremental Shopify sync (new orders only)…");

  try {
    let cursor: string | null = null;
    let shopifyTotal = emptyShopifySyncSummary();
    let guard = 0;
    const maxChunks = 400;

    cb.setStatus("Asking Shopify how many orders to load…");
    while (guard < maxChunks) {
      guard += 1;
      cb.setStatus(
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
        cb.setError(res.error);
        cb.setStatus(
          "Stopped after automatic retries — use Clear stuck sync lock only if still locked.",
        );
        return;
      }
      shopifyTotal = mergeShopifySyncSummaries(shopifyTotal, res.data);
      const since = shopifyTotal.incrementalFrom
        ? ` (new since ${new Date(shopifyTotal.incrementalFrom).toLocaleString()})`
        : "";
      cb.setStatus(
        `${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}${since}` +
          (res.data.hasMore ? "…" : " — Shopify done"),
      );
      if (res.data.errors.length && !res.data.complete) {
        cb.setError(res.data.errors.slice(0, 3).join(" · "));
        cb.setStatus(
          "Stopped — Shopify reported errors. Check Diagnostics, then Sync All again.",
        );
        return;
      }
      if (!res.data.hasMore) break;
      cursor = res.data.nextCursor ?? null;
      if (!cursor) break;
    }

    if (shopifyTotal.hasMore || !shopifyTotal.complete) {
      cb.setStatus(
        `${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)} — more remain. ` +
          "Click Sync All again — it resumes automatically.",
      );
      return;
    }

    cb.setStatus("Shopify orders done — loading abandoned checkouts…");
    let abandonedCursor: string | null = null;
    let abandonedTotal = emptyShopifyAbandonedSyncSummary();
    guard = 0;
    const abandonedMaxChunks = 400;

    while (guard < abandonedMaxChunks) {
      guard += 1;
      cb.setStatus(`${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}…`);
      const res = await runChunkWithAutoRetry({
        ...retryOpts,
        attempt: (token) =>
          syncShopifyAbandonedChunkViaApi(abandonedCursor, token, "incremental"),
      });
      if (!res.ok) {
        cb.setError(res.error);
        cb.setStatus("Stopped during abandoned checkouts after automatic retries.");
        return;
      }
      abandonedTotal = mergeShopifyAbandonedSyncSummaries(abandonedTotal, res.data);
      cb.setStatus(
        `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}` +
          (res.data.hasMore ? "…" : " — abandoned checkouts done"),
      );
      if (!res.data.hasMore) break;
      abandonedCursor = res.data.nextCursor ?? null;
      if (!abandonedCursor) break;
    }

    cb.setStatus("Abandoned checkouts done — tracking Delhivery AWBs…");
    // null = server loads saved Delhivery resume offset (does not restart at 0).
    let offset: number | null = null;
    let delhiveryTotal = emptyDelhiverySyncSummary();
    guard = 0;
    const delhiveryMaxChunks = 400;

    while (guard < delhiveryMaxChunks) {
      guard += 1;
      const through = delhiveryTotal.complete
        ? (delhiveryTotal.uniqueAwbsTracked || delhiveryTotal.awbsProcessed || 0)
        : (delhiveryTotal.nextOffset ?? delhiveryTotal.awbsProcessed ?? 0);
      cb.setStatus(
        `${formatAwbsTracked(through, delhiveryTotal.uniqueAwbsTracked || null)}…`,
      );
      const res = await runChunkWithAutoRetry({
        ...retryOpts,
        attempt: (token) => syncDelhiveryChunkViaApi(offset, token),
      });
      if (!res.ok) {
        cb.setError(res.error);
        cb.setStatus("Stopped during Delhivery after automatic retries.");
        return;
      }
      delhiveryTotal = mergeDelhiverySyncSummaries(delhiveryTotal, res.data);
      const progressThrough = res.data.complete
        ? (res.data.uniqueAwbsTracked || delhiveryTotal.awbsProcessed || 0)
        : (res.data.nextOffset ?? delhiveryTotal.awbsProcessed ?? 0);
      cb.setStatus(
        `${formatAwbsTracked(
          progressThrough,
          delhiveryTotal.uniqueAwbsTracked || null,
        )}` + (res.data.hasMore ? "…" : " — Delhivery done"),
      );
      if (!res.data.hasMore) break;
      offset = res.data.nextOffset ?? null;
      if (offset == null) break;
    }

    cb.setStatus("Commerce sync done — rebuilding call queues…");
    const queues = await refreshCustomerCallQueuesAction();
    if (!queues.ok) {
      cb.setError(queues.error);
      cb.setStatus(
        `Done — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}` +
          `${shopifyTotal.mode === "incremental" ? " (incremental)" : " (full)"}, ` +
          `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}, ` +
          `${formatAwbsTracked(delhiveryTotal.awbsProcessed ?? 0, delhiveryTotal.uniqueAwbsTracked || null)}. Queue rebuild failed.`,
      );
    } else {
      cb.setStatus(
        `Done — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}` +
          `${shopifyTotal.mode === "incremental" ? " (incremental)" : " (full)"}, ` +
          `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}, ` +
          `${formatAwbsTracked(delhiveryTotal.awbsProcessed ?? 0, delhiveryTotal.uniqueAwbsTracked || null)}, ` +
          `queues: ${queues.data.deliveryCandidates} delivery · ` +
          `${queues.data.reengagementCandidates} re-engagement.`,
      );
    }
  } catch (err) {
    cb.setError(formatCommerceSyncFailure(err));
    cb.setStatus(
      "Stopped — Sync All will auto-retry timeouts; Clear lock only for a hard reset.",
    );
  }
}

export async function runFullShopifyResyncJob(
  cb: CommerceSyncJobCallbacks,
): Promise<void> {
  const retryOpts = {
    getToken: cb.getToken,
    setToken: cb.setToken,
    onRetry: (attempt: number, maxAttempts: number) => {
      cb.setError(null);
      cb.setStatus(
        `Full re-sync interrupted — unlocking and retrying ${attempt}/${maxAttempts}…`,
      );
    },
  };

  cb.setError(null);
  cb.setStatus("Click received — full Shopify re-sync (entire catalog)…");

  try {
    let cursor: string | null = null;
    let shopifyTotal = emptyShopifySyncSummary();
    let guard = 0;
    const maxChunks = 600;

    cb.setStatus("Asking Shopify how many orders to load…");
    while (guard < maxChunks) {
      guard += 1;
      cb.setStatus(
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
        cb.setError(res.error);
        cb.setStatus(
          "Stopped after automatic retries — Clear stuck sync lock only for a hard reset.",
        );
        return;
      }
      shopifyTotal = mergeShopifySyncSummaries(shopifyTotal, res.data);
      cb.setStatus(
        `Full re-sync — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}` +
          (res.data.hasMore ? "…" : " — full Shopify done"),
      );
      if (res.data.errors.length && !res.data.complete) {
        cb.setError(res.data.errors.slice(0, 3).join(" · "));
        cb.setStatus("Stopped — Shopify reported errors during full re-sync.");
        return;
      }
      if (!res.data.hasMore) break;
      cursor = res.data.nextCursor ?? null;
      if (!cursor) break;
    }

    if (shopifyTotal.hasMore || !shopifyTotal.complete) {
      cb.setStatus(
        `Full re-sync — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)} — more remain. ` +
          "Click Full re-sync again — it resumes from where it left off.",
      );
      return;
    }

    cb.setStatus(
      `Full re-sync — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)} (complete) · ` +
        "loading abandoned checkouts…",
    );

    let abandonedCursor: string | null = null;
    let abandonedTotal = emptyShopifyAbandonedSyncSummary();
    guard = 0;
    const abandonedMaxChunks = 600;

    while (guard < abandonedMaxChunks) {
      guard += 1;
      cb.setStatus(
        `Full re-sync — ${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}…`,
      );
      const res = await runChunkWithAutoRetry({
        ...retryOpts,
        attempt: (token) =>
          syncShopifyAbandonedChunkViaApi(abandonedCursor, token, "full"),
      });
      if (!res.ok) {
        cb.setError(res.error);
        cb.setStatus("Stopped during abandoned checkouts after automatic retries.");
        return;
      }
      abandonedTotal = mergeShopifyAbandonedSyncSummaries(abandonedTotal, res.data);
      cb.setStatus(
        `Full re-sync — ${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}` +
          (res.data.hasMore ? "…" : " — abandoned checkouts done"),
      );
      if (!res.data.hasMore) break;
      abandonedCursor = res.data.nextCursor ?? null;
      if (!abandonedCursor) break;
    }

    cb.setStatus(
      `Full Shopify re-sync finished — ${formatOrdersLoaded(shopifyTotal.ordersRead, shopifyTotal.ordersTotal)}` +
        `${shopifyTotal.complete ? " (complete)" : " (more remain)"}, ` +
        `${formatCheckoutsLoaded(abandonedTotal.checkoutsRead)}` +
        `${abandonedTotal.complete ? " (complete)" : " (more remain)"}.`,
    );
  } catch (err) {
    cb.setError(formatCommerceSyncFailure(err));
    cb.setStatus(
      "Stopped — Full re-sync auto-retries timeouts; Clear lock only for a hard reset.",
    );
  }
}
