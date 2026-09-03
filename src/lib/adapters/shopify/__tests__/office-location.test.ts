import { describe, expect, it } from "vitest";
import { pickShopifyOfficeLocation } from "@/lib/adapters/shopify/live-graphql-connector";

describe("pickShopifyOfficeLocation", () => {
  it("prefers Aarla Office by name over other online locations", () => {
    expect(
      pickShopifyOfficeLocation([
        {
          id: "gid://shopify/Location/partner",
          name: "Partner Warehouse",
          isActive: true,
          fulfillsOnlineOrders: true,
        },
        {
          id: "gid://shopify/Location/office",
          name: "Aarla Office",
          isActive: true,
          fulfillsOnlineOrders: false,
        },
      ]),
    ).toBe("gid://shopify/Location/office");
  });

  it("falls back to online fulfilment when Aarla Office is missing", () => {
    expect(
      pickShopifyOfficeLocation([
        {
          id: "gid://shopify/Location/online",
          name: "Online Store",
          isActive: true,
          fulfillsOnlineOrders: true,
        },
        {
          id: "gid://shopify/Location/other",
          name: "Backup",
          isActive: true,
          fulfillsOnlineOrders: false,
        },
      ]),
    ).toBe("gid://shopify/Location/online");
  });
});
