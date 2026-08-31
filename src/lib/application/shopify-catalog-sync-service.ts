/**
 * Shopify product catalog → Aarla products / variants.
 * Chunked for Vercel. Does NOT write stock_movements or invent inventory.
 */
import type { ShopifyConnector } from "@/lib/adapters/shopify/port";
import { createLiveShopifyConnectorFromEnv } from "@/lib/adapters/shopify/live-graphql-connector";
import {
  emptyShopifyCatalogSyncSummary,
  type ShopifyCatalogSyncSummary,
} from "@/lib/domain/external-commerce-types";
import { ConfigurationError } from "@/lib/infra/db/errors";
import {
  ensureShopifyCatalogSchema,
  upsertShopifyCatalogProduct,
} from "@/lib/infra/repositories/postgres-shopify-catalog";
import {
  clearShopifyProductsWatermark,
  commitShopifyProductsWatermark,
  getShopifyProductsResumeCursor,
  getShopifyProductsWatermark,
  noteShopifyProductsSyncProgress,
  shopifyProductsUpdatedAfterQuery,
} from "@/lib/application/commerce-sync-watermarks";
import { ensureTenantBasicsViaPool } from "@/lib/infra/db/ensure-tenant";

export type SyncShopifyCatalogDeps = {
  connector?: ShopifyConnector;
  cursor?: string | null;
  maxPages?: number;
  mode?: "incremental" | "full";
  runId?: string | null;
};

function resolveConnector(deps: SyncShopifyCatalogDeps): ShopifyConnector {
  if (deps.connector) return deps.connector;
  const live = createLiveShopifyConnectorFromEnv();
  if (!live) {
    throw new ConfigurationError(
      "Shopify credentials missing. Set SHOPIFY_STORE_DOMAIN plus SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (Dev Dashboard), or SHOPIFY_ADMIN_API_ACCESS_TOKEN.",
    );
  }
  return live;
}

function defaultMaxPages(): number {
  const raw = process.env.SHOPIFY_PRODUCTS_SYNC_MAX_PAGES?.trim();
  const n = raw ? Number(raw) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 10);
}

function maxUpdatedAtIso(products: Array<{ updatedAt: string }>): string | null {
  let maxMs = 0;
  for (const p of products) {
    const ms = new Date(p.updatedAt).getTime();
    if (Number.isFinite(ms) && ms > maxMs) maxMs = ms;
  }
  return maxMs > 0 ? new Date(maxMs).toISOString() : null;
}

export async function syncShopifyCatalogData(
  deps: SyncShopifyCatalogDeps = {},
): Promise<ShopifyCatalogSyncSummary> {
  const summary = emptyShopifyCatalogSyncSummary();
  const connector = resolveConnector(deps);
  const maxPages = deps.maxPages ?? defaultMaxPages();
  const mode = deps.mode === "full" ? "full" : "incremental";
  summary.mode = mode;

  if (typeof connector.fetchProductsPage !== "function") {
    summary.errors.push("Shopify connector does not support product catalog — skipped.");
    summary.complete = true;
    summary.hasMore = false;
    summary.nextCursor = null;
    summary.pagesFetched = 0;
    return summary;
  }

  await ensureTenantBasicsViaPool();
  await ensureShopifyCatalogSchema();

  let query: string | null = null;
  let resumeCursor: string | null = deps.cursor ?? null;
  if (!resumeCursor) {
    resumeCursor = await getShopifyProductsResumeCursor();
  }

  if (mode === "incremental") {
    const watermark = await getShopifyProductsWatermark();
    summary.incrementalFrom = watermark;
    if (watermark) {
      query = shopifyProductsUpdatedAfterQuery(watermark);
    }
  } else {
    summary.incrementalFrom = null;
    if (!deps.cursor && !resumeCursor) {
      await clearShopifyProductsWatermark();
    }
  }

  let page;
  try {
    page = await connector.fetchProductsPage({
      cursor: resumeCursor,
      maxPages,
      pageSize: 5,
      query,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shopify product fetch failed";
    summary.errors.push(message);
    summary.hasMore = false;
    summary.nextCursor = null;
    summary.pagesFetched = 0;
    summary.complete = false;
    throw new Error(
      /ACCESS_DENIED|read_products|not authorized|permission/i.test(message)
        ? `${message} — grant the Shopify app the read_products scope, then retry.`
        : message,
    );
  }

  summary.productsRead = page.products.length;
  summary.hasMore = page.hasMore;
  summary.nextCursor = page.nextCursor;
  summary.pagesFetched = page.pagesFetched;
  summary.complete = !page.hasMore;

  for (const product of page.products) {
    try {
      const result = await upsertShopifyCatalogProduct(product, { skipSchemaEnsure: true });
      if (result.productAction === "inserted") summary.productsAdded += 1;
      else if (result.productAction === "updated") summary.productsUpdated += 1;
      else summary.recordsSkipped += 1;
      summary.variantsAdded += result.variantsInserted;
      summary.variantsUpdated += result.variantsUpdated;
      summary.recordsSkipped += result.variantsSkipped;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${product.title}: ${message}`);
      summary.recordsSkipped += 1;
    }
  }

  const runId = deps.runId?.trim() || null;
  if (runId) {
    await noteShopifyProductsSyncProgress({
      runId,
      maxUpdatedAt: maxUpdatedAtIso(page.products),
      nextCursor: page.hasMore ? page.nextCursor : null,
    });
    if (!page.hasMore) {
      await commitShopifyProductsWatermark(runId);
    }
  }

  return summary;
}
