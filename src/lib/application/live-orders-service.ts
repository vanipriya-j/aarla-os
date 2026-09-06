/**
 * Live Shopify order watch — refresh current opens + re-check existing Stock Check
 * rows so Shopify-fulfilled orders leave the queue (without Sync All).
 */
import "server-only";
import {
  acquireOrRenewCommerceSyncLock,
  releaseCommerceSyncLock,
} from "@/lib/application/commerce-sync-lock";
import { shopifyOrdersByNamesQuery } from "@/lib/application/commerce-sync-watermarks";
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * One live-desk tick:
 * 1) Pull current Shopify Unfulfilled/Partial opens
 * 2) Re-fetch early Fulfil queue orders by name (status catch-up for already-shipped)
 * 3) Ingest new opens + auto-archive rows no longer open in Shopify
 */
export async function runLiveOrdersTick(input: {
  lockToken: string;
  /** Max Shopify order pages this tick for the open query (default 3). */
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
    const repo = createFulfilmentRepository();

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

    // Status catch-up: open-fulfilment only returns still-open Shopify orders.
    // Rows already in Stock Check that Shopify fulfilled later must be re-fetched
    // by name so archiveAlreadyShippedStockChecks can clear them.
    const earlyNumbers = await repo.listEarlyQueueOrderNumbers(80);
    for (const batch of chunk(earlyNumbers, 10)) {
      const searchQuery = shopifyOrdersByNamesQuery(batch);
      if (!searchQuery) continue;
      const page = await syncShopifyCustomerCallData({
        mode: "targeted",
        searchQuery,
        runId: lockToken,
        maxPages: 1,
      });
      ordersRead += page.ordersRead;
      ordersUpserted += page.ordersAdded + page.ordersUpdated;
    }

    const fulfil = await syncIncomingOrdersIntoFulfilment(200);
    const openRows = await repo.listWorkbench("stock-check");

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
