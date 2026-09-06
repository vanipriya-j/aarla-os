/**
 * Live Shopify order watch — open Unfulfilled/Partial refresh + fulfil ingest.
 * Does not rely on the created_at incremental watermark (that misses older opens).
 */
import "server-only";
import {
  acquireOrRenewCommerceSyncLock,
  releaseCommerceSyncLock,
} from "@/lib/application/commerce-sync-lock";
import { syncShopifyCustomerCallData } from "@/lib/application/shopify-sync-service";
import { syncIncomingOrdersIntoFulfilment } from "@/lib/application/fulfilment-service";
import { createFulfilmentRepository } from "@/lib/infra/repositories/postgres-fulfilment";

export type LiveOrdersTickResult = {
  skipped: boolean;
  reason?: string;
  ordersRead: number;
  ordersUpserted: number;
  fulfilCreated: number;
  fulfilArchived: number;
  salesPosted: number;
  salesSkipped: number;
  newFulfilmentIds: string[];
  openStockCheck: Array<{
    id: string;
    orderNumber: string;
    customerName: string | null;
  }>;
};

/**
 * One live-desk tick: refresh current open Shopify fulfilment orders (bounded
 * chunks), then ingest into Fulfilment and post Studio Shopify Sale movements.
 */
export async function runLiveOrdersTick(input: {
  lockToken: string;
  /** Max Shopify order pages this tick (default 3). */
  maxChunks?: number;
}): Promise<LiveOrdersTickResult> {
  const lockToken = input.lockToken.trim();
  const empty: LiveOrdersTickResult = {
    skipped: true,
    ordersRead: 0,
    ordersUpserted: 0,
    fulfilCreated: 0,
    fulfilArchived: 0,
    salesPosted: 0,
    salesSkipped: 0,
    newFulfilmentIds: [],
    openStockCheck: [],
  };
  if (!lockToken) {
    return { ...empty, reason: "Missing lock token" };
  }

  const lock = await acquireOrRenewCommerceSyncLock(lockToken, "shopify");
  if (!lock.ok) {
    return { ...empty, reason: lock.error };
  }

  try {
    let cursor: string | null = null;
    let ordersRead = 0;
    let ordersUpserted = 0;
    const maxChunks = Math.max(1, Math.min(input.maxChunks ?? 3, 8));

    for (let i = 0; i < maxChunks; i += 1) {
      const page = await syncShopifyCustomerCallData({
        cursor,
        mode: "open-fulfilment",
        runId: lockToken,
        maxPages: 1,
      });
      ordersRead += page.ordersRead;
      ordersUpserted += page.ordersAdded + page.ordersUpdated;
      if (!page.hasMore) break;
      cursor = page.nextCursor ?? null;
      if (!cursor) break;
    }

    const fulfil = await syncIncomingOrdersIntoFulfilment(200);
    const openRows = await createFulfilmentRepository().listWorkbench("stock-check");

    return {
      skipped: false,
      ordersRead,
      ordersUpserted,
      fulfilCreated: fulfil.created,
      fulfilArchived: fulfil.archived,
      salesPosted: fulfil.salesPosted,
      salesSkipped: fulfil.salesSkipped,
      newFulfilmentIds: fulfil.ids,
      openStockCheck: openRows.slice(0, 40).map((r) => ({
        id: r.id,
        orderNumber: r.orderNumber,
        customerName: r.customerName,
      })),
    };
  } finally {
    await releaseCommerceSyncLock(lockToken).catch(() => undefined);
  }
}
