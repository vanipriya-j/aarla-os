import { describe, expect, it } from "vitest";
import {
  isAarlaOfficeLocationName,
  pickAarlaOfficeAvailable,
  pickShopifyOfficeLocation,
} from "@/lib/adapters/shopify/live-graphql-connector";

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

describe("pickAarlaOfficeAvailable", () => {
  it("uses Aarla Office Available and ignores shop total / other locations", () => {
    const picked = pickAarlaOfficeAvailable({
      shopTotal: 14,
      levels: [
        {
          location: {
            id: "gid://shopify/Location/partner",
            name: "Partner Stock",
            isActive: true,
            fulfillsOnlineOrders: false,
          },
          quantities: [{ name: "available", quantity: 5 }],
        },
        {
          location: {
            id: "gid://shopify/Location/office",
            name: "Aarla Office",
            isActive: true,
            fulfillsOnlineOrders: true,
          },
          quantities: [{ name: "available", quantity: 9 }],
        },
      ],
    });
    expect(picked.available).toBe(9);
    expect(picked.locationName).toBe("Aarla Office");
    expect(picked.shopTotal).toBe(14);
    expect(picked.levelSummary).toContain("Aarla Office=9");
    expect(picked.levelSummary).toContain("Partner Stock=5");
  });

  it("does not fall back to another location when Aarla Office is missing", () => {
    const picked = pickAarlaOfficeAvailable({
      shopTotal: 14,
      levels: [
        {
          location: {
            id: "gid://shopify/Location/partner",
            name: "Partner Stock",
            isActive: true,
            fulfillsOnlineOrders: true,
          },
          quantities: [{ name: "available", quantity: 14 }],
        },
      ],
    });
    expect(picked.available).toBe(0);
    expect(picked.locationId).toBeNull();
    expect(picked.shopTotal).toBe(14);
  });

  it("recognizes Aarla Office name variants", () => {
    expect(isAarlaOfficeLocationName("Aarla Office")).toBe(true);
    expect(isAarlaOfficeLocationName("aarla  office")).toBe(true);
    expect(isAarlaOfficeLocationName("Partner Hub")).toBe(false);
  });
});
