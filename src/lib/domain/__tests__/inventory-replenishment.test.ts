import { describe, expect, it } from "vitest";
import { computeReplenishment } from "@/lib/domain/inventory-replenishment";
import { movementsSeed } from "@/lib/domain/ledger";
import { locations, partners, products } from "@/lib/domain/catalog";
import type { ReorderRule } from "@/lib/domain/types";

const teeId = "prod-chennai-tee";
const artId = "prod-kolam-art";
const trayId = "prod-carnatic-tray";

function replenish(rules: ReorderRule[]) {
  return computeReplenishment({
    products,
    movements: movementsSeed,
    locations,
    partners,
    rules,
  });
}

describe("computeReplenishment", () => {
  it("flags aarla-low and global-low for a product-level rule under both thresholds", () => {
    const items = replenish([{ id: "r1", productId: trayId, minQuantity: 15, notes: "" }]);

    expect(items).toHaveLength(2);
    const aarla = items.find((i) => i.kind === "aarla-low")!;
    expect(aarla.studio).toBe(11);
    expect(aarla.suggestedAction).toBe("Manufacture");

    const global = items.find((i) => i.kind === "global-low")!;
    expect(global.total).toBe(11);
    expect(global.suggestedAction).toBe("Reorder / Manufacture");
  });

  it("does not flag anything once stock clears the minimum", () => {
    const items = replenish([{ id: "r2", productId: trayId, minQuantity: 5, notes: "" }]);
    expect(items).toHaveLength(0);
  });

  it("scopes to a specific variant when the rule carries a variantId", () => {
    const items = replenish([
      { id: "r3", productId: teeId, variantId: "var-tee-ind-l", minQuantity: 10, notes: "" },
    ]);

    expect(items).toHaveLength(2); // aarla-low + global-low, both for the low variant only
    expect(items.every((i) => i.variantId === "var-tee-ind-l")).toBe(true);
    expect(items[0].studio).toBe(3);

    // The healthy Indigo M variant of the same product never appears.
    expect(items.some((i) => i.variantId === "var-tee-ind-m")).toBe(false);
  });

  it("flags partner-need when a partner-scoped rule's partner stock is below minimum", () => {
    const items = replenish([
      {
        id: "r4",
        productId: teeId,
        variantId: "var-tee-mus-l",
        partnerId: "partner-freshly",
        minQuantity: 10,
        notes: "",
      },
    ]);

    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.kind).toBe("partner-need");
    expect(item.partnerId).toBe("partner-freshly");
    expect(item.partnerName).toBe("Freshly Brewed");
    expect(item.partnerQty).toBe(6);
    // Studio has 0 of this variant — can't just move existing stock.
    expect(item.suggestedAction).toBe("Create Transfer");
  });

  it("suggests Transfer for partner-need when studio can cover the shortfall", () => {
    const items = replenish([
      {
        id: "r5",
        productId: artId,
        variantId: "var-art-12",
        partnerId: "partner-nimalli",
        minQuantity: 3,
        notes: "",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("partner-need");
    expect(items[0].partnerQty).toBe(2);
    // Studio holds 3, shortfall is only 1 — a simple transfer covers it.
    expect(items[0].suggestedAction).toBe("Transfer");
  });

  it("does not flag a partner-need rule once the partner's stock clears the minimum", () => {
    const items = replenish([
      {
        id: "r6",
        productId: teeId,
        variantId: "var-tee-mus-l",
        partnerId: "partner-freshly",
        minQuantity: 5,
        notes: "",
      },
    ]);
    expect(items).toHaveLength(0);
  });

  it("ignores rules for unknown products", () => {
    const items = replenish([
      { id: "r7", productId: "prod-does-not-exist", minQuantity: 5, notes: "" },
    ]);
    expect(items).toHaveLength(0);
  });

  it("returns no items when there are no rules", () => {
    expect(replenish([])).toEqual([]);
  });
});
