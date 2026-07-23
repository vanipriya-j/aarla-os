import { beforeEach, describe, expect, it } from "vitest";
import {
  LEDGER_STORAGE_KEYS,
  LOC,
  balanceAt,
  createOrGetManufacturingPO,
  deriveBalances,
  ensureSeededMovements,
  getMovements,
  getPurchaseOrders,
  movementsSeed,
  partnerStockFor,
  receiveAgainstPO,
  recordPartnerSale,
  resetLedgerStorage,
  setMovementIdGenerator,
  transferToPartner,
  upsertPurchaseOrder,
} from "@/lib/domain";
import { buildPurchaseOrder, resetFixtureSeq } from "@/test/fixtures/builders";

function installDeterministicIds() {
  let n = 0;
  setMovementIdGenerator(() => {
    n += 1;
    return `mv-test-${n}`;
  });
}

describe("ledger LocalStorage integration", () => {
  beforeEach(() => {
    resetFixtureSeq();
    resetLedgerStorage();
    window.localStorage.clear();
    installDeterministicIds();
  });

  it("1. one ledger is the source of truth (seeded once into storage)", () => {
    const a = getMovements();
    const b = getMovements();
    expect(a).toEqual(b);
    expect(a.length).toBe(movementsSeed.length);
    expect(window.localStorage.getItem(LEDGER_STORAGE_KEYS.seeded)).toBe("1");
    expect(JSON.parse(window.localStorage.getItem(LEDGER_STORAGE_KEYS.movements)!)).toHaveLength(
      movementsSeed.length,
    );
  });

  it("12. seed movements are initialized only once", () => {
    ensureSeededMovements();
    const raw1 = window.localStorage.getItem(LEDGER_STORAGE_KEYS.movements)!;
    // Mutate stored ledger
    const parsed = JSON.parse(raw1);
    parsed.pop();
    window.localStorage.setItem(LEDGER_STORAGE_KEYS.movements, JSON.stringify(parsed));
    window.localStorage.setItem(LEDGER_STORAGE_KEYS.seeded, "1");

    const again = ensureSeededMovements();
    expect(again).toHaveLength(movementsSeed.length - 1);
    expect(window.localStorage.getItem(LEDGER_STORAGE_KEYS.movements)).toBe(
      JSON.stringify(parsed),
    );
  });

  it("2+3. receiveAgainstPO posts receipt + damage and increases usable stock", () => {
    const po = upsertPurchaseOrder(
      buildPurchaseOrder({
        id: "PO-RCV-1",
        productId: "prod-muruga-bottle",
        quantityOrdered: 50,
        quantityReceived: 0,
        status: "Sent",
      }),
    );
    const studioBefore = balanceAt(deriveBalances(getMovements()), po.productId, LOC.studio);
    const damageBefore = balanceAt(deriveBalances(getMovements()), po.productId, LOC.damage);

    const result = receiveAgainstPO({
      poId: po.id,
      accepted: 45,
      damaged: 3,
      missing: 2,
      notes: "QC receive",
    });
    expect(result).not.toBeNull();
    expect(result!.movements).toHaveLength(2);
    expect(result!.movements.map((m) => m.movementType).sort()).toEqual(["Damage", "Purchase Receipt"]);

    const bal = deriveBalances(getMovements());
    expect(balanceAt(bal, po.productId, LOC.studio)).toBe(studioBefore + 45);
    expect(balanceAt(bal, po.productId, LOC.damage)).toBe(damageBefore + 3);
    expect(result!.purchaseOrder.quantityReceived).toBe(45);
  });

  it("4. transfer conserves quantity between studio and partner", () => {
    const productId = "prod-kolam-bottle";
    const before = deriveBalances(getMovements());
    const studioBefore = balanceAt(before, productId, LOC.studio);
    const partnerBefore = balanceAt(before, productId, LOC.nimalli);

    const mv = transferToPartner({
      productId,
      partnerId: "partner-nimalli",
      quantity: 2,
      reference: "TR-TEST-NIM-2",
    });
    expect(mv).not.toBeNull();

    const after = deriveBalances(getMovements());
    expect(balanceAt(after, productId, LOC.studio)).toBe(studioBefore - 2);
    expect(balanceAt(after, productId, LOC.nimalli)).toBe(partnerBefore + 2);
  });

  it("5. partner sale reduces partner stock", () => {
    const productId = "prod-kolam-bottle";
    const before = partnerStockFor(getMovements(), "partner-freshly").find(
      (s) => s.productId === productId,
    )?.quantity;
    expect(before).toBeGreaterThan(0);

    const mv = recordPartnerSale({
      productId,
      partnerId: "partner-freshly",
      quantity: 1,
      reference: "PSALE-TEST-1",
    });
    expect(mv).not.toBeNull();

    const after = partnerStockFor(getMovements(), "partner-freshly").find(
      (s) => s.productId === productId,
    )?.quantity;
    expect(after).toBe((before ?? 0) - 1);
  });

  it("10. duplicate Approve / Confirm / Transfer / Record Sale do not create duplicate writes", () => {
    const poInput = {
      id: "PO-IDEM-1",
      vendorId: "vendor-velan",
      productId: "prod-muruga-bottle",
      quantity: 12,
      unitCost: 320,
      requiredDate: "2026-09-01",
    };
    const a = createOrGetManufacturingPO(poInput);
    const b = createOrGetManufacturingPO(poInput);
    expect(a.id).toBe(b.id);
    expect(getPurchaseOrders().filter((p) => p.id === "PO-IDEM-1")).toHaveLength(1);

    const r1 = receiveAgainstPO({
      poId: "PO-IDEM-1",
      accepted: 10,
      damaged: 1,
      missing: 1,
      notes: "first",
    });
    const countAfterFirst = getMovements().length;
    const r2 = receiveAgainstPO({
      poId: "PO-IDEM-1",
      accepted: 10,
      damaged: 1,
      missing: 1,
      notes: "duplicate confirm",
    });
    expect(r1!.movements.length).toBeGreaterThan(0);
    expect(r2!.movements).toHaveLength(0);
    expect(getMovements()).toHaveLength(countAfterFirst);

    const t1 = transferToPartner({
      productId: "prod-kolam-bottle",
      partnerId: "partner-nimalli",
      quantity: 1,
      reference: "TR-DUP-1",
    });
    const count2 = getMovements().length;
    const t2 = transferToPartner({
      productId: "prod-kolam-bottle",
      partnerId: "partner-nimalli",
      quantity: 1,
      reference: "TR-DUP-1",
    });
    expect(t1).not.toBeNull();
    expect(t2).toBeNull();
    expect(getMovements()).toHaveLength(count2);

    const s1 = recordPartnerSale({
      productId: "prod-kolam-bottle",
      partnerId: "partner-freshly",
      quantity: 1,
      reference: "PSALE-DUP-1",
    });
    const count3 = getMovements().length;
    const s2 = recordPartnerSale({
      productId: "prod-kolam-bottle",
      partnerId: "partner-freshly",
      quantity: 1,
      reference: "PSALE-DUP-1",
    });
    expect(s1).not.toBeNull();
    expect(s2).toBeNull();
    expect(getMovements()).toHaveLength(count3);
  });

  it("11. stock cannot become negative", () => {
    const productId = "prod-kolam-bottle";
    const studio = balanceAt(deriveBalances(getMovements()), productId, LOC.studio);
    const failed = transferToPartner({
      productId,
      partnerId: "partner-nimalli",
      quantity: studio + 50,
      reference: "TR-NEG-FAIL",
    });
    expect(failed).toBeNull();
    expect(balanceAt(deriveBalances(getMovements()), productId, LOC.studio)).toBe(studio);

    const partnerQty =
      partnerStockFor(getMovements(), "partner-freshly").find((s) => s.productId === productId)
        ?.quantity ?? 0;
    const saleFail = recordPartnerSale({
      productId,
      partnerId: "partner-freshly",
      quantity: partnerQty + 10,
      reference: "PSALE-NEG-FAIL",
    });
    expect(saleFail).toBeNull();
  });

  it("13. corrupt or incompatible LocalStorage data is handled safely", () => {
    window.localStorage.setItem(LEDGER_STORAGE_KEYS.movements, "{not-json");
    expect(() => getMovements()).not.toThrow();
    expect(getMovements().length).toBe(movementsSeed.length);

    window.localStorage.setItem(
      LEDGER_STORAGE_KEYS.movements,
      JSON.stringify([{ id: 1, broken: true }]),
    );
    window.localStorage.removeItem(LEDGER_STORAGE_KEYS.seeded);
    expect(() => getMovements()).not.toThrow();
    expect(getMovements().length).toBe(movementsSeed.length);

    window.localStorage.setItem(LEDGER_STORAGE_KEYS.purchaseOrders, "null");
    expect(() => getPurchaseOrders()).not.toThrow();
    expect(Array.isArray(getPurchaseOrders())).toBe(true);
  });
});
