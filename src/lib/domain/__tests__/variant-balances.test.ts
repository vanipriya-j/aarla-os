import { beforeEach, describe, expect, it } from "vitest";
import {
  LOC,
  appendMovements,
  balanceAt,
  buildAdjustmentMovement,
  deriveBalances,
  deriveVariantLocationBreakdown,
  deriveVariantTotals,
  getMovements,
  locations,
  products,
  recordPartnerSale,
  resetLedgerStorage,
  setMovementIdGenerator,
  transferToPartner,
} from "@/lib/domain";
import { resetFixtureSeq } from "@/test/fixtures/builders";

function installDeterministicIds() {
  let n = 0;
  setMovementIdGenerator(() => {
    n += 1;
    return `mv-vtest-${n}`;
  });
}

describe("variant-aware ledger balances (Inventory & Replenishment PR2)", () => {
  beforeEach(() => {
    resetFixtureSeq();
    resetLedgerStorage();
    window.localStorage.clear();
    installDeterministicIds();
  });

  it("variant totals aggregate across locations", () => {
    const movements = getMovements();
    const tee = products.find((p) => p.id === "prod-chennai-tee")!;
    const cells = deriveVariantTotals(movements, tee.id, tee.variants, locations);

    const indigoL = cells.find((c) => c.variantId === "var-tee-ind-l")!;
    expect(indigoL.studio).toBe(3);
    expect(indigoL.partner).toBe(0);
    expect(indigoL.total).toBe(3);

    const mustardL = cells.find((c) => c.variantId === "var-tee-mus-l")!;
    expect(mustardL.studio).toBe(0);
    expect(mustardL.partner).toBe(6);
    expect(mustardL.total).toBe(6);
    expect(
      mustardL.byLocation.some((l) => l.locationId === LOC.freshly && l.quantity === 6),
    ).toBe(true);
  });

  it("product-level balanceAt sums across variants (backward compatible)", () => {
    const movements = getMovements();
    const bal = deriveBalances(movements);
    // prod-kolam-art studio = var-art-08 (12) + var-art-12 (5 - 2 transferred) + unspecified (7)
    expect(balanceAt(bal, "prod-kolam-art", LOC.studio)).toBe(12 + 3 + 7);
    expect(balanceAt(bal, "prod-kolam-art", LOC.studio, "var-art-08")).toBe(12);
    expect(balanceAt(bal, "prod-kolam-art", LOC.studio, "var-art-12")).toBe(3);
  });

  it("transfer reduces source and increases destination at the variant level", () => {
    const before = deriveBalances(getMovements());
    const studioBefore = balanceAt(before, "prod-chennai-tee", LOC.studio, "var-tee-ind-m");
    const otherVariantBefore = balanceAt(before, "prod-chennai-tee", LOC.studio, "var-tee-ind-s");

    const mv = transferToPartner({
      productId: "prod-chennai-tee",
      variantId: "var-tee-ind-m",
      partnerId: "partner-nimalli",
      quantity: 4,
      reference: "TR-VARIANT-TEST-1",
    });
    expect(mv).not.toBeNull();
    expect(mv?.variantId).toBe("var-tee-ind-m");

    const after = deriveBalances(getMovements());
    expect(balanceAt(after, "prod-chennai-tee", LOC.studio, "var-tee-ind-m")).toBe(
      studioBefore - 4,
    );
    expect(balanceAt(after, "prod-chennai-tee", LOC.nimalli, "var-tee-ind-m")).toBe(4);

    // Sibling variant of the same product is untouched.
    expect(balanceAt(after, "prod-chennai-tee", LOC.studio, "var-tee-ind-s")).toBe(
      otherVariantBefore,
    );
  });

  it("variant-scoped negative stock is prevented even when other variants have plenty", () => {
    // var-tee-ind-l studio = 3. Requesting 10 must fail even though the *product* pooled
    // across every variant has far more than 10 units sitting in studio.
    const failed = transferToPartner({
      productId: "prod-chennai-tee",
      variantId: "var-tee-ind-l",
      partnerId: "partner-nimalli",
      quantity: 10,
      reference: "TR-VARIANT-NEG-FAIL",
    });
    expect(failed).toBeNull();

    const bal = deriveBalances(getMovements());
    expect(balanceAt(bal, "prod-chennai-tee", LOC.studio, "var-tee-ind-l")).toBe(3);
  });

  it("partner sale reduces variant-specific partner stock", () => {
    const before = deriveBalances(getMovements());
    const partnerBefore = balanceAt(before, "prod-chennai-tee", LOC.freshly, "var-tee-mus-l");
    expect(partnerBefore).toBe(6);

    const sale = recordPartnerSale({
      productId: "prod-chennai-tee",
      variantId: "var-tee-mus-l",
      partnerId: "partner-freshly",
      quantity: 2,
      reference: "PSALE-VARIANT-TEST-1",
    });
    expect(sale).not.toBeNull();
    expect(sale?.variantId).toBe("var-tee-mus-l");

    const after = deriveBalances(getMovements());
    expect(balanceAt(after, "prod-chennai-tee", LOC.freshly, "var-tee-mus-l")).toBe(4);
  });

  it("partner sale is blocked when the variant's partner stock is insufficient", () => {
    const failed = recordPartnerSale({
      productId: "prod-chennai-tee",
      variantId: "var-tee-mus-l",
      partnerId: "partner-freshly",
      quantity: 99,
      reference: "PSALE-VARIANT-NEG-FAIL",
    });
    expect(failed).toBeNull();
  });

  it("buildAdjustmentMovement writes a compensating Adjustment for a negative delta", () => {
    const bal = deriveBalances(getMovements());
    const currentQty = balanceAt(bal, "prod-chennai-tee", LOC.studio, "var-tee-ind-s");
    expect(currentQty).toBe(24);

    // Physical count found 2 fewer units than the system believes.
    const adjustment = buildAdjustmentMovement({
      productId: "prod-chennai-tee",
      variantId: "var-tee-ind-s",
      locationId: LOC.studio,
      delta: -2,
      reason: "missing",
      currentQty,
    });
    expect(adjustment).not.toBeNull();
    expect(adjustment?.movementType).toBe("Adjustment");
    expect(adjustment?.fromLocationId).toBe(LOC.studio);
    expect(adjustment?.toLocationId).toBe(LOC.external);
    expect(adjustment?.quantity).toBe(2);

    const created = appendMovements([adjustment!]);
    expect(created).toHaveLength(1);

    const after = deriveBalances(getMovements());
    expect(balanceAt(after, "prod-chennai-tee", LOC.studio, "var-tee-ind-s")).toBe(22);
  });

  it("buildAdjustmentMovement writes a compensating Adjustment for a positive delta", () => {
    const before = balanceAt(
      deriveBalances(getMovements()),
      "prod-kolam-art",
      LOC.studio,
      "var-art-08",
    );
    const adjustment = buildAdjustmentMovement({
      productId: "prod-kolam-art",
      variantId: "var-art-08",
      locationId: LOC.studio,
      delta: 3,
      reason: "count correction",
    });
    expect(adjustment).not.toBeNull();
    expect(adjustment?.fromLocationId).toBe(LOC.external);
    expect(adjustment?.toLocationId).toBe(LOC.studio);

    appendMovements([adjustment!]);
    const after = balanceAt(
      deriveBalances(getMovements()),
      "prod-kolam-art",
      LOC.studio,
      "var-art-08",
    );
    expect(after).toBe(before + 3);
  });

  it("buildAdjustmentMovement rejects a zero delta and an over-drawing negative delta", () => {
    expect(
      buildAdjustmentMovement({
        productId: "prod-kolam-art",
        variantId: "var-art-08",
        locationId: LOC.studio,
        delta: 0,
        reason: "other",
      }),
    ).toBeNull();

    expect(
      buildAdjustmentMovement({
        productId: "prod-kolam-art",
        variantId: "var-art-08",
        locationId: LOC.studio,
        delta: -100,
        reason: "damaged",
        currentQty: 12,
      }),
    ).toBeNull();
  });

  it("appendMovements independently rejects an adjustment that would overdraw the real ledger", () => {
    // currentQty omitted — appendMovements' own balance check must still catch this.
    const adjustment = buildAdjustmentMovement({
      productId: "prod-chennai-tee",
      variantId: "var-tee-ind-l",
      locationId: LOC.studio,
      delta: -50,
      reason: "damaged",
    });
    expect(adjustment).not.toBeNull();

    const created = appendMovements([adjustment!]);
    expect(created).toHaveLength(0);

    const bal = balanceAt(
      deriveBalances(getMovements()),
      "prod-chennai-tee",
      LOC.studio,
      "var-tee-ind-l",
    );
    expect(bal).toBe(3);
  });

  it("deriveVariantLocationBreakdown reports damaged and reserved (channel) stock for a variant", () => {
    appendMovements([
      {
        productId: "prod-chennai-tee",
        variantId: "var-tee-ind-s",
        quantity: 2,
        fromLocationId: LOC.studio,
        toLocationId: LOC.damage,
        movementType: "Damage",
        reference: "DMG-VARIANT-TEST",
        notes: "test damage",
      },
      {
        productId: "prod-chennai-tee",
        variantId: "var-tee-ind-s",
        quantity: 5,
        fromLocationId: LOC.studio,
        toLocationId: LOC.shopify,
        movementType: "Transfer",
        reference: "TR-SHOPIFY-VARIANT-TEST",
        notes: "test channel allocation",
      },
    ]);

    const cell = deriveVariantLocationBreakdown(
      getMovements(),
      "prod-chennai-tee",
      "var-tee-ind-s",
      locations,
    );
    expect(cell.damaged).toBe(2);
    expect(cell.channel).toBe(5);
    expect(cell.reserved).toBe(5);
    expect(cell.studio).toBe(24 - 2 - 5);
    expect(cell.available).toBe(cell.studio);
  });
});
