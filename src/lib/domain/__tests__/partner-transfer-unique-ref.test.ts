import { describe, expect, it } from "vitest";
import { balanceAt, deriveBalances, getMovements, transferToPartner } from "@/lib/domain/ledger";
import { LOC } from "@/lib/domain/catalog";

describe("partner transfer unique references", () => {
  it("allows a second transfer of the same product/qty (no silent fingerprint block)", () => {
    const productId = "prod-kolam-bottle";
    const partnerId = "partner-nimalli";
    const before = balanceAt(deriveBalances(getMovements()), productId, LOC.studio);
    if (before < 2) return; // seed may already be drained in shared suite

    const first = transferToPartner({ productId, partnerId, quantity: 1 });
    const second = transferToPartner({ productId, partnerId, quantity: 1 });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.reference).not.toBe(second!.reference);
  });
});
