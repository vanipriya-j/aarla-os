import { describe, expect, it } from "vitest";
import { shopifyVariantSearchQuery } from "@/lib/application/inventory-sync-service";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";

describe("push-available helpers", () => {
  it("builds a searchable Shopify variant query for push", () => {
    expect(
      shopifyVariantSearchQuery({
        shopifyVariantId: "gid://shopify/ProductVariant/42",
        sku: "ARL-X",
      }),
    ).toBe("id:42");
  });

  it("fixture connector accepts Available quantity sets", async () => {
    const connector = new FixtureShopifyConnector();
    const result = await connector.setInventoryQuantities!([
      {
        inventoryItemId: "gid://shopify/InventoryItem/fixture-1",
        locationId: "gid://shopify/Location/fixture-primary",
        quantity: 16,
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
