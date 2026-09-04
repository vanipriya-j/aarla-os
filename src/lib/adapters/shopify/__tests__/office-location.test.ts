import { describe, expect, it } from "vitest";
import {
  flattenInventoryLevels,
  isAarlaOfficeLocationName,
  pickAarlaOfficeAvailable,
  pickShopifyOfficeLocationStrict,
} from "@/lib/adapters/shopify/live-graphql-connector";

describe("pickShopifyOfficeLocationStrict", () => {
  it("returns only Aarla Office — no online fallback", () => {
    expect(
      pickShopifyOfficeLocationStrict([
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

  it("returns null when Aarla Office is missing (do not use shop total location)", () => {
    expect(
      pickShopifyOfficeLocationStrict([
        {
          id: "gid://shopify/Location/online",
          name: "Online Store",
          isActive: true,
          fulfillsOnlineOrders: true,
        },
      ]),
    ).toBeNull();
  });
});

describe("flattenInventoryLevels", () => {
  it("reads Shopify edges shape", () => {
    const levels = flattenInventoryLevels({
      edges: [
        {
          node: {
            location: { id: "loc-1", name: "Aarla Office" },
            quantities: [{ name: "available", quantity: 9 }],
          },
        },
        {
          node: {
            location: { id: "loc-2", name: "Partner" },
            quantities: [{ name: "available", quantity: 5 }],
          },
        },
      ],
    });
    expect(levels).toHaveLength(2);
    expect(levels[0]?.location?.name).toBe("Aarla Office");
  });
});

describe("pickAarlaOfficeAvailable", () => {
  it("uses direct office inventoryLevel and ignores shop total", () => {
    const picked = pickAarlaOfficeAvailable({
      shopTotal: 14,
      preferredLocationId: "gid://shopify/Location/office",
      officeLevel: {
        location: { id: "gid://shopify/Location/office", name: "Aarla Office" },
        quantities: [
          { name: "available", quantity: 9 },
          { name: "on_hand", quantity: 9 },
          { name: "committed", quantity: 0 },
        ],
      },
      levels: [
        {
          location: {
            id: "gid://shopify/Location/partner",
            name: "Partner Stock",
          },
          quantities: [{ name: "available", quantity: 5 }],
        },
      ],
    });
    expect(picked.available).toBe(9);
    expect(picked.shopTotal).toBe(14);
    expect(picked.locationName).toBe("Aarla Office");
  });

  it("matches preferred Office location id even without name on the level", () => {
    const picked = pickAarlaOfficeAvailable({
      shopTotal: 14,
      preferredLocationId: "gid://shopify/Location/office",
      levels: [
        {
          location: { id: "gid://shopify/Location/office", name: null },
          quantities: [{ name: "available", quantity: 9 }],
        },
        {
          location: { id: "gid://shopify/Location/partner", name: "Partner" },
          quantities: [{ name: "available", quantity: 5 }],
        },
      ],
    });
    expect(picked.available).toBe(9);
    expect(picked.locationId).toBe("gid://shopify/Location/office");
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
    expect(isAarlaOfficeLocationName("Office")).toBe(false);
  });
});
