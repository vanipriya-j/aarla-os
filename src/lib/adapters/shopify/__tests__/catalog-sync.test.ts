import { describe, expect, it } from "vitest";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";
import {
  emptyShopifyCatalogSyncSummary,
  mergeShopifyCatalogSyncSummaries,
} from "@/lib/domain/external-commerce-types";
import { shopifyProductsUpdatedAfterQuery } from "@/lib/application/commerce-sync-watermarks";

describe("Shopify catalog sync fixtures", () => {
  it("builds an updated_at incremental Shopify search filter with overlap", () => {
    const q = shopifyProductsUpdatedAfterQuery("2026-08-03T12:00:00.000Z");
    expect(q).toMatch(/^updated_at:>'/);
    expect(q).toContain("2026-08-03T11:58:00.000Z");
  });
  it("fixture connector returns products with variants (no inventory qty)", async () => {
    const connector = new FixtureShopifyConnector();
    const page = await connector.fetchProductsPage!();
    expect(page.products.length).toBeGreaterThan(0);
    expect(page.products[0]!.variants.length).toBeGreaterThan(0);
    expect(page.products[0]!.externalProductId).toBeTruthy();
    expect(page.hasMore).toBe(false);
  });

  it("fixture connector returns variant inventory for opening balances", async () => {
    const connector = new FixtureShopifyConnector();
    const page = await connector.fetchVariantInventoryPage!();
    expect(page.variants.length).toBeGreaterThan(0);
    expect(page.variants.every((v) => v.available >= 0)).toBe(true);
  });

  it("fixture connector filters products by updated_at incremental query", async () => {
    const connector = new FixtureShopifyConnector();
    const all = await connector.fetchProductsPage!();
    const filtered = await connector.fetchProductsPage!({
      query: "updated_at:>'2099-01-01T00:00:00.000Z'",
    });
    expect(all.products.length).toBeGreaterThan(0);
    expect(filtered.products.length).toBe(0);
  });

  it("merges catalog sync summaries", () => {
    const a = emptyShopifyCatalogSyncSummary();
    a.productsRead = 2;
    a.productsAdded = 1;
    const b = emptyShopifyCatalogSyncSummary();
    b.productsRead = 3;
    b.productsUpdated = 2;
    b.variantsAdded = 4;
    b.hasMore = false;
    b.complete = true;
    const m = mergeShopifyCatalogSyncSummaries(a, b);
    expect(m.productsRead).toBe(5);
    expect(m.productsAdded).toBe(1);
    expect(m.productsUpdated).toBe(2);
    expect(m.variantsAdded).toBe(4);
    expect(m.complete).toBe(true);
  });
});
