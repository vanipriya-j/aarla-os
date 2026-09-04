import { describe, expect, it } from "vitest";
import { buildStockTableRows } from "@/lib/domain/inventory-stock-table";
import { LOC, locations, products as catalogProducts } from "@/lib/domain/catalog";
import type { Product, ReorderRule, StockMovement } from "@/lib/domain/types";

describe("Needs Making zero-stock signal", () => {
  it("includes variants with total 0 even without reorder rules", () => {
    const base = catalogProducts[0]!;
    const products: Product[] = [
      {
        ...base,
        id: "tee",
        sku: "TEE",
        title: "Tyagaraja Tee",
        variants: [
          { id: "tee-l", label: "L", sku: "TEE-L" },
          { id: "tee-m", label: "M", sku: "TEE-M" },
        ],
      },
    ];
    const movements: StockMovement[] = [
      {
        id: "m1",
        date: "2026-01-01",
        productId: "tee",
        variantId: "tee-m",
        quantity: 5,
        fromLocationId: LOC.external,
        toLocationId: LOC.studio,
        movementType: "Purchase Receipt",
        reference: "seed",
        notes: "",
      },
    ];
    const rules: ReorderRule[] = [];
    const rows = buildStockTableRows({
      products,
      movements,
      locations,
      reorderRules: rules,
    });
    const zero = rows.filter((r) => r.total === 0);
    expect(zero.some((r) => r.variantId === "tee-l")).toBe(true);
    expect(rows.find((r) => r.variantId === "tee-m")?.total).toBe(5);
  });
});
