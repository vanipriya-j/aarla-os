import { describe, expect, it } from "vitest";
import {
  classifyOrderValidity,
  computeLatestValidOrderDates,
  shopifyGidToExternalId,
} from "@/lib/adapters/shopify/normalize";
import type { ShopifyOrderRecord } from "@/lib/adapters/shopify/port";

function order(partial: Partial<ShopifyOrderRecord>): ShopifyOrderRecord {
  return {
    externalId: "1",
    orderNumber: "#1",
    externalCustomerId: "c1",
    orderDate: "2026-07-01T00:00:00.000Z",
    financialStatus: "PAID",
    fulfilmentStatus: null,
    cancelledAt: null,
    isTest: false,
    totalAmount: 100,
    currency: "INR",
    lineItems: [],
    fulfilments: [],
    ...partial,
  };
}

describe("Shopify normalize", () => {
  it("strips Shopify GIDs", () => {
    expect(shopifyGidToExternalId("gid://shopify/Customer/1001")).toBe("1001");
    expect(shopifyGidToExternalId("1001")).toBe("1001");
    expect(shopifyGidToExternalId(null)).toBeNull();
  });

  it("flags cancelled, test, refunded, and no-customer orders", () => {
    expect(classifyOrderValidity(order({ cancelledAt: "2026-07-02T00:00:00Z" }))).toEqual({
      isValid: false,
      exclusionReason: "cancelled",
    });
    expect(classifyOrderValidity(order({ isTest: true }))).toEqual({
      isValid: false,
      exclusionReason: "test",
    });
    expect(classifyOrderValidity(order({ financialStatus: "REFUNDED" }))).toEqual({
      isValid: false,
      exclusionReason: "fully_refunded",
    });
    expect(classifyOrderValidity(order({ externalCustomerId: null }))).toEqual({
      isValid: false,
      exclusionReason: "no_customer",
    });
    expect(classifyOrderValidity(order({}))).toEqual({
      isValid: true,
      exclusionReason: null,
    });
  });

  it("computes latest valid purchase date per customer", () => {
    const latest = computeLatestValidOrderDates([
      {
        externalCustomerId: "1001",
        orderDate: "2026-07-20T00:00:00.000Z",
        isValid: true,
      },
      {
        externalCustomerId: "1001",
        orderDate: "2026-07-28T00:00:00.000Z",
        isValid: true,
      },
      {
        externalCustomerId: "1001",
        orderDate: "2026-08-01T00:00:00.000Z",
        isValid: false,
      },
      {
        externalCustomerId: "1002",
        orderDate: "2026-06-15T00:00:00.000Z",
        isValid: true,
      },
    ]);
    expect(latest.get("1001")).toBe("2026-07-28T00:00:00.000Z");
    expect(latest.get("1002")).toBe("2026-06-15T00:00:00.000Z");
  });
});
