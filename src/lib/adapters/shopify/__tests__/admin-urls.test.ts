import { describe, expect, it } from "vitest";
import { shopifyAdminProductUrl } from "@/lib/adapters/shopify/admin-urls";

describe("shopifyAdminProductUrl", () => {
  const env = {
    SHOPIFY_STORE_DOMAIN: "aarla.myshopify.com",
  } as NodeJS.ProcessEnv;

  it("builds an Admin product URL from a numeric id", () => {
    expect(shopifyAdminProductUrl("51908121919789", env)).toBe(
      "https://admin.shopify.com/store/aarla/products/51908121919789",
    );
  });

  it("accepts a Product GID", () => {
    expect(shopifyAdminProductUrl("gid://shopify/Product/12345", env)).toBe(
      "https://admin.shopify.com/store/aarla/products/12345",
    );
  });

  it("returns null without store domain or a non-numeric id", () => {
    expect(shopifyAdminProductUrl("123", {} as NodeJS.ProcessEnv)).toBeNull();
    expect(shopifyAdminProductUrl("prod-tote", env)).toBeNull();
    expect(shopifyAdminProductUrl(null, env)).toBeNull();
  });
});
