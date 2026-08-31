import { describe, expect, it } from "vitest";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";
import {
  emptyShopifyCatalogSyncSummary,
  mergeShopifyCatalogSyncSummaries,
} from "@/lib/domain/external-commerce-types";

describe("Shopify catalog sync fixtures", () => {
  it("fixture connector returns products with variants (no inventory qty)", async () => {
    const connector = new FixtureShopifyConnector();
    const page = await connector.fetchProductsPage!();
    expect(page.products.length).toBeGreaterThan(0);
    expect(page.products[0]!.variants.length).toBeGreaterThan(0);
    expect(page.products[0]!.externalProductId).toBeTruthy();
    expect(page.hasMore).toBe(false);
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
