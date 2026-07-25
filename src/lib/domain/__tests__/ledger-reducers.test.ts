import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_INVENTORY_LOC,
  LOC,
  balanceAt,
  deriveBalances,
  deriveInventorySnapshots,
  locations,
  movementsSeed,
  partnerStockFor,
  products,
  vendors,
} from "@/lib/domain";
import { buildStockMovement, resetFixtureSeq } from "@/test/fixtures/builders";

describe("ledger reducers / projectors (Phase 0–1 invariants)", () => {
  beforeEach(() => {
    resetFixtureSeq();
  });

  it("1. one catalog is the source of product/vendor truth", () => {
    const ids = new Set(products.map((p) => p.id));
    expect(ids.size).toBe(products.length);
    expect(products.some((p) => p.id === "prod-kolam-bottle")).toBe(true);

    const vendorIds = new Set(vendors.map((v) => v.id));
    expect(vendorIds.size).toBe(vendors.length);
    expect(vendors.some((v) => v.id.startsWith("vendor-"))).toBe(true);
  });

  it("2. Purchase Receipt increases usable stock at destination", () => {
    const before = deriveBalances([]);
    expect(balanceAt(before, "prod-kolam-bottle", LOC.studio)).toBe(0);

    const after = deriveBalances([
      buildStockMovement({
        productId: "prod-kolam-bottle",
        quantity: 10,
        fromLocationId: LOC.external,
        toLocationId: LOC.studio,
        movementType: "Purchase Receipt",
        reference: "PO-TEST-1",
      }),
    ]);
    expect(balanceAt(after, "prod-kolam-bottle", LOC.studio)).toBe(10);
  });

  it("3. Damage stock is separated from usable stock", () => {
    const balances = deriveBalances([
      buildStockMovement({
        quantity: 47,
        toLocationId: LOC.studio,
        movementType: "Purchase Receipt",
        reference: "PO-A",
      }),
      buildStockMovement({
        quantity: 3,
        toLocationId: LOC.damage,
        movementType: "Damage",
        reference: "PO-A-QC",
      }),
    ]);
    expect(balanceAt(balances, "prod-kolam-bottle", LOC.studio)).toBe(47);
    expect(balanceAt(balances, "prod-kolam-bottle", LOC.damage)).toBe(3);

    const snap = deriveInventorySnapshots(
      [
        buildStockMovement({
          quantity: 47,
          toLocationId: LOC.studio,
          movementType: "Purchase Receipt",
          reference: "PO-A",
        }),
        buildStockMovement({
          quantity: 3,
          toLocationId: LOC.damage,
          movementType: "Damage",
          reference: "PO-A-QC",
        }),
      ],
      products,
      locations,
      DEFAULT_INVENTORY_LOC,
    ).find((s) => s.productId === "prod-kolam-bottle");
    expect(snap?.damaged).toBe(3);
    expect(snap?.available).toBe(47);
    expect(snap?.available).not.toBe((snap?.available ?? 0) + (snap?.damaged ?? 0));
  });

  it("4. Transfer reduces source and increases destination by the same quantity", () => {
    const movements = [
      buildStockMovement({
        quantity: 20,
        fromLocationId: LOC.external,
        toLocationId: LOC.studio,
        movementType: "Purchase Receipt",
        reference: "PO-T",
      }),
      buildStockMovement({
        quantity: 7,
        fromLocationId: LOC.studio,
        toLocationId: LOC.freshly,
        movementType: "Transfer",
        reference: "TR-T",
      }),
    ];
    const bal = deriveBalances(movements);
    expect(balanceAt(bal, "prod-kolam-bottle", LOC.studio)).toBe(13);
    expect(balanceAt(bal, "prod-kolam-bottle", LOC.freshly)).toBe(7);
  });

  it("5. Partner Sale reduces partner stock", () => {
    const movements = [
      buildStockMovement({
        quantity: 8,
        fromLocationId: LOC.studio,
        toLocationId: LOC.freshly,
        movementType: "Transfer",
        reference: "TR-FB",
      }),
      buildStockMovement({
        quantity: 2,
        fromLocationId: LOC.freshly,
        toLocationId: LOC.sold,
        movementType: "Partner Sale",
        reference: "PSALE-1",
      }),
    ];
    const stock = partnerStockFor(movements, "partner-freshly", locations);
    const kolam = stock.find((s) => s.productId === "prod-kolam-bottle");
    expect(kolam?.quantity).toBe(6);
  });

  it("6. inventory positions are derived only from Stock Movements", () => {
    const fromSeed = deriveInventorySnapshots(
      movementsSeed,
      products,
      locations,
      DEFAULT_INVENTORY_LOC,
    );
    const empty = deriveInventorySnapshots([], products, locations, DEFAULT_INVENTORY_LOC);
    expect(empty.every((s) => s.totalOnHand === 0 && s.damaged === 0)).toBe(true);
    expect(fromSeed.some((s) => s.totalOnHand > 0)).toBe(true);

    // No parallel inventory table — snapshots are a pure function of movements.
    const recomputed = deriveInventorySnapshots(
      movementsSeed,
      products,
      locations,
      DEFAULT_INVENTORY_LOC,
    );
    expect(recomputed).toEqual(fromSeed);
  });

  it("seed balances keep usable studio stock non-negative in snapshots", () => {
    const snaps = deriveInventorySnapshots(
      movementsSeed,
      products,
      locations,
      DEFAULT_INVENTORY_LOC,
    );
    for (const s of snaps) {
      expect(s.studioStock).toBeGreaterThanOrEqual(0);
      expect(s.partnerStock).toBeGreaterThanOrEqual(0);
      expect(s.damaged).toBeGreaterThanOrEqual(0);
    }
  });
});
