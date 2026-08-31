import { describe, expect, it } from "vitest";
import {
  orderAgeDays,
  recommendShippingMode,
  suggestFreebie,
  suggestPacking,
  buildPackingActual,
} from "@/lib/domain/fulfilment-decisions";
import {
  isPastFulfilmentCutoff,
  istMinutesSinceMidnight,
  statusesForTab,
} from "@/lib/domain/fulfilment-types";

describe("fulfilment decisions", () => {
  it("suggests packing materials from line titles", () => {
    const s = suggestPacking([
      { title: "Kolam Bottle", quantity: 1 },
      { title: "Tyagaraja Tee — Navy L", quantity: 1 },
      { title: "Devis Book", quantity: 1 },
    ]);
    expect(s.cover).toMatch(/ecommerce cover/i);
    expect(s.materials.some((m) => /bubble/i.test(m.label))).toBe(true);
    expect(s.materials.some((m) => /board/i.test(m.label))).toBe(true);
    expect(s.materials.some((m) => /butter/i.test(m.label))).toBe(true);
    expect(s.signature).toContain("units:");
  });

  it("prefers a learned packing override for similar orders", () => {
    const s = suggestPacking(
      [
        { title: "Filter Coffee Sticker Sheet", quantity: 1 },
        { title: "Ganesha Tote Bag", quantity: 2 },
      ],
      {
        cover: "Aarla white bag",
        materials: [
          { code: "aarla-white-bag", label: "Aarla white bag" },
          { code: "thank-you-card", label: "Thank-you card" },
        ],
        note: "Store pickup — white bag only",
      },
    );
    expect(s.cover).toBe("Aarla white bag");
    expect(s.learnedFromNote).toMatch(/Store pickup/);
    expect(s.materials.map((m) => m.label)).toContain("Aarla white bag");
  });

  it("records free-form packing line items as-is", () => {
    const actual = buildPackingActual({
      items: ["Aarla white bag", "Large ecommerce cover", "Thank-you card"],
      signature: "units:2to3|apparel+sticker",
      reason: "Bagter + online style: bag inside cover",
    });
    expect(actual.cover).toBe("Aarla white bag");
    expect(actual.materials.map((m) => m.label)).toEqual([
      "Aarla white bag",
      "Large ecommerce cover",
      "Thank-you card",
    ]);
  });

  it("suggests freebie only when studio stock exists", () => {
    const rules = [
      {
        name: "Bookmark over 1500",
        minOrderValue: 1500,
        maxOrderValue: null,
        productCode: "prod-bookmark",
        variantCode: null,
        estimatedCost: 25,
        priority: 10,
        label: "Kolam Bookmark",
      },
    ];
    expect(suggestFreebie(1697, rules, {})).toBeNull();
    expect(suggestFreebie(1697, rules, { "prod-bookmark": 2 })?.label).toBe(
      "Kolam Bookmark",
    );
  });

  it("defaults Surface and marks incomplete costs", () => {
    const rec = recommendShippingMode({
      orderAgeDays: 1,
      shippingPaid: 80,
      orderValue: 1600,
      estimatedContribution: null,
      hasPromisedDate: false,
      daysUntilPromised: null,
      costsComplete: false,
    });
    expect(rec.method).toBe("delhivery-surface");
    expect(rec.incomplete).toBe(true);
  });

  it("recommends Express for aged orders when costs complete", () => {
    const rec = recommendShippingMode({
      orderAgeDays: 4,
      shippingPaid: 80,
      orderValue: 2000,
      estimatedContribution: 500,
      hasPromisedDate: false,
      daysUntilPromised: null,
      costsComplete: true,
    });
    expect(rec.method).toBe("delhivery-express");
    expect(rec.incomplete).toBe(false);
  });

  it("computes order age in whole days", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    expect(orderAgeDays("2026-08-30T09:00:00.000Z", now)).toBe(1);
  });
});

describe("fulfilment tabs and cut-off", () => {
  it("maps needs-attention statuses", () => {
    expect(statusesForTab("needs-attention")).toContain("stock-exception");
    expect(statusesForTab("completed")).toEqual(["dispatched", "cancelled"]);
  });

  it("computes IST minutes", () => {
    const m = istMinutesSinceMidnight(new Date("2026-08-31T07:00:00.000Z")); // 12:30 IST
    expect(m).toBe(12 * 60 + 30);
    expect(isPastFulfilmentCutoff(new Date("2026-08-31T07:00:00.000Z"))).toBe(true);
    expect(isPastFulfilmentCutoff(new Date("2026-08-31T06:59:00.000Z"))).toBe(false);
  });
});
