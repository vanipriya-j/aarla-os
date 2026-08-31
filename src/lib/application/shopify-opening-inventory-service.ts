/**
 * One-time legacy base inventory from Shopify inventoryQuantity.
 * Writes Purchase Receipt External→Studio. Not continuous sync.
 */
import type { ShopifyConnector } from "@/lib/adapters/shopify/port";
import { createLiveShopifyConnectorFromEnv } from "@/lib/adapters/shopify/live-graphql-connector";
import { ConfigurationError } from "@/lib/infra/db/errors";
import { ensureCoreInventoryLocations } from "@/lib/infra/db/ensure-inventory-locations";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query } from "@/lib/infra/db/pool";
import * as services from "@/lib/application/services";

export type OpeningInventorySyncSummary = {
  variantsRead: number;
  receiptsWritten: number;
  unitsPosted: number;
  skippedAlreadyStocked: number;
  skippedUnmatched: number;
  skippedZero: number;
  errors: string[];
  hasMore: boolean;
  nextCursor: string | null;
  pagesFetched: number;
  complete: boolean;
};

export type SyncOpeningInventoryDeps = {
  connector?: ShopifyConnector;
  cursor?: string | null;
  maxPages?: number;
};

function resolveConnector(deps: SyncOpeningInventoryDeps): ShopifyConnector {
  if (deps.connector) return deps.connector;
  const live = createLiveShopifyConnectorFromEnv();
  if (!live) {
    throw new ConfigurationError(
      "Shopify credentials missing. Set SHOPIFY_STORE_DOMAIN plus SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (Dev Dashboard), or SHOPIFY_ADMIN_API_ACCESS_TOKEN.",
    );
  }
  return live;
}

async function mapShopifyVariantToAarla(
  externalVariantId: string,
  sku: string,
): Promise<{ productCode: string; variantCode: string } | null> {
  const byShopify = await query<{ product_code: string; variant_code: string }>(
    `select p.code as product_code, pv.code as variant_code
     from product_variants pv
     join products p on p.id = pv.product_id
     where pv.organization_id = $1 and pv.shopify_variant_id = $2
     limit 1`,
    [ORG_ID, externalVariantId],
  );
  if (byShopify[0]) {
    return {
      productCode: byShopify[0].product_code,
      variantCode: byShopify[0].variant_code,
    };
  }
  if (sku) {
    const bySku = await query<{ product_code: string; variant_code: string }>(
      `select p.code as product_code, pv.code as variant_code
       from product_variants pv
       join products p on p.id = pv.product_id
       where pv.organization_id = $1 and pv.sku = $2
       limit 1`,
      [ORG_ID, sku],
    );
    if (bySku[0]) {
      return { productCode: bySku[0].product_code, variantCode: bySku[0].variant_code };
    }
  }
  return null;
}

/**
 * Pull one page of Shopify variant inventory and post opening Studio receipts
 * for matched catalog variants that currently have zero Studio stock.
 */
export async function syncShopifyOpeningInventory(
  deps: SyncOpeningInventoryDeps = {},
): Promise<OpeningInventorySyncSummary> {
  const summary: OpeningInventorySyncSummary = {
    variantsRead: 0,
    receiptsWritten: 0,
    unitsPosted: 0,
    skippedAlreadyStocked: 0,
    skippedUnmatched: 0,
    skippedZero: 0,
    errors: [],
    hasMore: false,
    nextCursor: null,
    pagesFetched: 0,
    complete: true,
  };

  const connector = resolveConnector(deps);
  if (typeof connector.fetchVariantInventoryPage !== "function") {
    summary.errors.push("Shopify connector does not support inventory quantities — skipped.");
    return summary;
  }

  await ensureCoreInventoryLocations();

  let page;
  try {
    page = await connector.fetchVariantInventoryPage({
      cursor: deps.cursor ?? null,
      maxPages: deps.maxPages ?? 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shopify inventory fetch failed";
    throw new Error(
      /ACCESS_DENIED|read_inventory|not authorized|permission/i.test(message)
        ? `${message} — grant the Shopify app the read_inventory scope, then retry.`
        : message,
    );
  }

  summary.variantsRead = page.variants.length;
  summary.hasMore = page.hasMore;
  summary.nextCursor = page.nextCursor;
  summary.pagesFetched = page.pagesFetched;
  summary.complete = !page.hasMore;

  const rows: Array<{ productId: string; variantId: string; quantity: number; notes: string }> =
    [];

  for (const v of page.variants) {
    if (v.available <= 0) {
      summary.skippedZero += 1;
      continue;
    }
    const match = await mapShopifyVariantToAarla(v.externalVariantId, v.sku);
    if (!match) {
      summary.skippedUnmatched += 1;
      continue;
    }
    rows.push({
      productId: match.productCode,
      variantId: match.variantCode,
      quantity: v.available,
      notes: `Legacy opening balance from Shopify inventory (${v.available} available)`,
    });
  }

  if (rows.length) {
    try {
      const result = await services.establishOpeningBalances(rows);
      summary.receiptsWritten = result.written.length;
      summary.unitsPosted = result.written.reduce((n, m) => n + m.quantity, 0);
      summary.skippedAlreadyStocked += result.skipped;
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return summary;
}
