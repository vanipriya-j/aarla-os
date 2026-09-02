import { describe, expect, it } from "vitest";
import { shopifyVariantSearchQuery } from "@/lib/application/inventory-sync-service";

describe("shopifyVariantSearchQuery", () => {
  it("prefers numeric / GID variant id", () => {
    expect(shopifyVariantSearchQuery({ shopifyVariantId: "12345" })).toBe("id:12345");
    expect(
      shopifyVariantSearchQuery({
        shopifyVariantId: "gid://shopify/ProductVariant/998877",
        sku: "IGNORE",
      }),
    ).toBe("id:998877");
  });

  it("falls back to sku", () => {
    expect(shopifyVariantSearchQuery({ sku: "ARL-ADT-XS-015" })).toBe("sku:ARL-ADT-XS-015");
    expect(shopifyVariantSearchQuery({ sku: "TEE XL" })).toBe('sku:"TEE XL"');
  });
});
