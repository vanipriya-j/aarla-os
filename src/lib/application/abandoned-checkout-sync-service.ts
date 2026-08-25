import type { ShopifyConnector } from "@/lib/adapters/shopify/port";
import { createLiveShopifyConnectorFromEnv } from "@/lib/adapters/shopify/live-graphql-connector";
import { createExternalCommerceRepository } from "@/lib/infra/repositories/postgres-external-commerce";
import type { ExternalCommerceRepository } from "@/lib/repositories/external-commerce";
import {
  emptyShopifyAbandonedSyncSummary,
  type ShopifyAbandonedSyncSummary,
} from "@/lib/domain/external-commerce-types";
import { ConfigurationError } from "@/lib/infra/db/errors";
import {
  clearShopifyAbandonedWatermark,
  commitShopifyAbandonedWatermark,
  getShopifyAbandonedResumeCursor,
  getShopifyAbandonedWatermark,
  noteShopifyAbandonedSyncProgress,
  shopifyAbandonedCreatedAfterQuery,
} from "@/lib/application/commerce-sync-watermarks";

export type SyncShopifyAbandonedCheckoutsDeps = {
  connector?: ShopifyConnector;
  repo?: ExternalCommerceRepository;
  /** Resume cursor from a previous chunk */
  cursor?: string | null;
  /** Checkout pages per invocation (default 1 ≈ 50 checkouts) */
  maxPages?: number;
  /**
   * incremental (default): only checkouts updated after the last successful sync watermark.
   * full: walk the entire abandoned-checkout history.
   */
  mode?: "incremental" | "full";
  /** Sync run id (lock token) — required to commit the watermark after the last chunk */
  runId?: string | null;
};

function resolveConnector(deps: SyncShopifyAbandonedCheckoutsDeps): ShopifyConnector {
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
  // Default 1 page (~50 checkouts) per invocation — safer under Vercel 60s limits.
  const raw = process.env.SHOPIFY_ABANDONED_SYNC_MAX_PAGES?.trim();
  const n = raw ? Number(raw) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 10);
}

function maxActivityDateIso(checkouts: Array<{ lastActivityAt: string }>): string | null {
  let maxMs = 0;
  for (const c of checkouts) {
    const ms = new Date(c.lastActivityAt).getTime();
    if (Number.isFinite(ms) && ms > maxMs) maxMs = ms;
  }
  return maxMs > 0 ? new Date(maxMs).toISOString() : null;
}

/**
 * Server-side Shopify abandoned-checkout → Aarla OS commerce sync for the
 * abandoned-cart Customer Calls segment. Chunked for Vercel timeouts — pass
 * `cursor` from the previous summary to continue. Default mode is incremental.
 *
 * Connectors that do not implement `fetchAbandonedCheckoutsPage` (older
 * fixtures/tests) are skipped gracefully — an empty, complete summary with a
 * note is returned rather than throwing.
 */
export async function syncShopifyAbandonedCheckouts(
  deps: SyncShopifyAbandonedCheckoutsDeps = {},
): Promise<ShopifyAbandonedSyncSummary> {
  const summary = emptyShopifyAbandonedSyncSummary();
  const repo = deps.repo ?? createExternalCommerceRepository();
  const connector = resolveConnector(deps);
  const maxPages = deps.maxPages ?? defaultMaxPages();
  const mode = deps.mode === "full" ? "full" : "incremental";
  summary.mode = mode;

  if (typeof connector.fetchAbandonedCheckoutsPage !== "function") {
    summary.errors.push(
      "Shopify connector does not support abandoned checkouts — skipped.",
    );
    summary.complete = true;
    summary.hasMore = false;
    summary.nextCursor = null;
    summary.pagesFetched = 0;
    return summary;
  }

  await repo.ensureAbandonedCheckoutSchema();

  let query: string | null = null;
  let resumeCursor: string | null = deps.cursor ?? null;
  if (!resumeCursor) {
    resumeCursor = await getShopifyAbandonedResumeCursor();
  }

  if (mode === "incremental") {
    const watermark = await getShopifyAbandonedWatermark();
    summary.incrementalFrom = watermark;
    if (watermark) {
      query = shopifyAbandonedCreatedAfterQuery(watermark);
    }
  } else {
    summary.incrementalFrom = null;
    if (!deps.cursor && !resumeCursor) {
      await clearShopifyAbandonedWatermark();
    }
  }

  let page;
  try {
    page = await connector.fetchAbandonedCheckoutsPage({
      cursor: resumeCursor,
      maxPages,
      query,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shopify fetch failed";
    summary.errors.push(message);
    summary.hasMore = false;
    summary.nextCursor = null;
    summary.pagesFetched = 0;
    summary.complete = false;
    throw new Error(message);
  }

  summary.checkoutsRead = page.checkouts.length;
  summary.hasMore = page.hasMore;
  summary.nextCursor = page.nextCursor;
  summary.pagesFetched = page.pagesFetched;
  summary.complete = !page.hasMore;

  for (const checkout of page.checkouts) {
    try {
      const result = await repo.upsertAbandonedCheckout({
        provider: "shopify",
        externalId: checkout.externalId,
        externalCustomerId: checkout.externalCustomerId,
        customerName: checkout.customerName,
        phone: checkout.phone,
        email: checkout.email,
        checkoutUrl: checkout.checkoutUrl,
        subtotal: checkout.subtotal,
        currency: checkout.currency,
        createdAt: checkout.createdAt,
        lastActivityAt: checkout.lastActivityAt,
        completedAt: checkout.completedAt,
        lineItems: checkout.lineItems,
      });
      if (result.created) summary.checkoutsAdded += 1;
      else summary.checkoutsUpdated += 1;
    } catch (err) {
      summary.recordsSkipped += 1;
      summary.errors.push(
        `Abandoned checkout ${checkout.externalId}: ${
          err instanceof Error ? err.message : "upsert failed"
        }`,
      );
    }
  }

  if (deps.runId) {
    await noteShopifyAbandonedSyncProgress({
      runId: deps.runId,
      maxActivityAt: maxActivityDateIso(page.checkouts),
      nextCursor: page.hasMore ? page.nextCursor : null,
    });
  }

  if (summary.complete && deps.runId) {
    await commitShopifyAbandonedWatermark(deps.runId);
  }

  return summary;
}
