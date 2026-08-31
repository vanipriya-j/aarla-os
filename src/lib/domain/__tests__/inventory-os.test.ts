import { describe, expect, it } from "vitest";
import {
  buildReplenishmentCycles,
  computeVariantSalesPace,
} from "@/lib/domain/inventory-sales-pace";
import { ageBandForDays, fifoLayersAtLocation } from "@/lib/domain/inventory-aging";
import { computeInventoryHealth } from "@/lib/domain/inventory-health";
import { getVariantAvailability, variantsMatchingOption } from "@/lib/domain/inventory-availability";
import type { Location, StockMovement } from "@/lib/domain/types";

describe("sales pace — availability-adjusted velocity", () => {
  it("treats 50 received / 50 sold in 5 days as ~10/day, not 50/30", () => {
    const cycles = buildReplenishmentCycles({
      receipts: [
        {
          productId: "p1",
          variantId: "v1",
          quantity: 50,
          availableOn: "2026-08-01",
        },
      ],
      sales: Array.from({ length: 5 }, (_, i) => ({
        productId: "p1",
        variantId: "v1",
        quantity: 10,
        soldOn: `2026-08-0${i + 1}`,
      })),
      asOf: "2026-08-31",
    });

    expect(cycles).toHaveLength(1);
    const c = cycles[0]!;
    expect(c.soldOut).toBe(true);
    expect(c.daysToSellOut).toBe(5);
    expect(c.velocityPerDay).toBe(10);
    // Must not dilute across the stock-out month.
    expect(c.velocityPerDay).not.toBeCloseTo(50 / 30, 1);
  });

  it("uses inclusive days-to-sell-out so Aug1→Aug5 is 5 days and velocity is 10/day", () => {
    const pace = computeVariantSalesPace({
      productId: "p1",
      variantId: "v1",
      studioQty: 0,
      receipts: [
        { productId: "p1", variantId: "v1", quantity: 50, availableOn: "2026-08-01" },
      ],
      sales: [
        { productId: "p1", variantId: "v1", quantity: 10, soldOn: "2026-08-01" },
        { productId: "p1", variantId: "v1", quantity: 10, soldOn: "2026-08-02" },
        { productId: "p1", variantId: "v1", quantity: 10, soldOn: "2026-08-03" },
        { productId: "p1", variantId: "v1", quantity: 10, soldOn: "2026-08-04" },
        { productId: "p1", variantId: "v1", quantity: 10, soldOn: "2026-08-05" },
      ],
      asOf: "2026-08-31",
    });

    expect(pace.lastCycle?.daysToSellOut).toBe(5);
    expect(pace.lastCycle?.velocityPerDay).toBe(10);
    expect(pace.classification).toBe("extremely-fast");
    expect(pace.currentlyStockedOut).toBe(true);
  });
});

describe("FIFO aging", () => {
  it("ages remaining stock from inbound movement_date", () => {
    const movements: StockMovement[] = [
      {
        id: "m1",
        date: "2026-01-01",
        productId: "p1",
        variantId: "v1",
        quantity: 10,
        fromLocationId: "loc-external",
        toLocationId: "loc-studio",
        movementType: "Purchase Receipt",
        reference: "PO-1",
        notes: "",
      },
      {
        id: "m2",
        date: "2026-02-01",
        productId: "p1",
        variantId: "v1",
        quantity: 4,
        fromLocationId: "loc-studio",
        toLocationId: "loc-sold",
        movementType: "Studio Sale",
        reference: "S-1",
        notes: "",
      },
    ];
    const layers = fifoLayersAtLocation({
      movements,
      productId: "p1",
      variantId: "v1",
      locationId: "loc-studio",
      asOf: "2026-03-01",
    });
    expect(layers).toHaveLength(1);
    expect(layers[0]!.quantity).toBe(6);
    expect(layers[0]!.ageDays).toBeGreaterThan(50);
    expect(ageBandForDays(59)).toBe("31-60");
  });
});

describe("inventory health", () => {
  it("recommends replenish-now for fast mover with zero studio", () => {
    const pace = computeVariantSalesPace({
      productId: "p1",
      variantId: "v1",
      studioQty: 0,
      receipts: [
        { productId: "p1", variantId: "v1", quantity: 50, availableOn: "2026-08-01" },
      ],
      sales: Array.from({ length: 5 }, (_, i) => ({
        productId: "p1",
        variantId: "v1",
        quantity: 10,
        soldOn: `2026-08-0${i + 1}`,
      })),
      asOf: "2026-08-10",
    });
    const health = computeInventoryHealth({
      studioQty: 0,
      partnerQty: 2,
      pace,
      aging: null,
    });
    expect(health.action).toBe("replenish-now");
  });
});

describe("availability soft holds", () => {
  it("subtracts soft reservations from studio available now", () => {
    const locations: Location[] = [
      { id: "loc-studio", name: "Studio", kind: "Studio" },
      { id: "loc-shopify", name: "Shopify", kind: "Channel" },
      { id: "loc-external", name: "External", kind: "External" },
    ];
    const movements: StockMovement[] = [
      {
        id: "m1",
        date: "2026-08-01",
        productId: "p1",
        variantId: "v1",
        quantity: 5,
        fromLocationId: "loc-external",
        toLocationId: "loc-studio",
        movementType: "Purchase Receipt",
        reference: "PO-1",
        notes: "",
      },
    ];
    const avail = getVariantAvailability({
      movements,
      productId: "p1",
      variantId: "v1",
      locations,
      softHolds: [{ productId: "p1", variantId: "v1", quantity: 2 }],
    });
    expect(avail.studio).toBe(5);
    expect(avail.softReserved).toBe(2);
    expect(avail.studioAvailableNow).toBe(3);
  });
});

describe("by-size slice", () => {
  it("filters apparel variants by Size option", () => {
    const variants = [
      { id: "a", label: "Red L", sku: "A", options: { Size: "L", Colour: "Red" } },
      { id: "b", label: "Blue L", sku: "B", options: { Size: "L", Colour: "Blue" } },
      { id: "c", label: "Red M", sku: "C", options: { Size: "M", Colour: "Red" } },
    ];
    const large = variantsMatchingOption(variants, "Size", "L");
    expect(large.map((v) => v.id)).toEqual(["a", "b"]);
  });
});

describe("do-not-replenish policy", () => {
  it("overrides pace-based replenish pressure", () => {
    const pace = computeVariantSalesPace({
      productId: "p1",
      variantId: "v1",
      studioQty: 0,
      receipts: [
        { productId: "p1", variantId: "v1", quantity: 50, availableOn: "2026-08-01" },
      ],
      sales: Array.from({ length: 5 }, (_, i) => ({
        productId: "p1",
        variantId: "v1",
        quantity: 10,
        soldOn: `2026-08-0${i + 1}`,
      })),
      asOf: "2026-08-10",
    });
    const health = computeInventoryHealth({
      studioQty: 0,
      partnerQty: 0,
      pace,
      aging: null,
      policy: {
        action: "do-not-replenish",
        reason: "old_collection",
        note: "Retiring print",
      },
    });
    expect(health.action).toBe("do-not-replenish");
  });
});
