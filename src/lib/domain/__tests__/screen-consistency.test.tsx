import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DEFAULT_INVENTORY_LOC,
  LOC,
  balanceAt,
  deriveBalances,
  deriveInventorySnapshots,
  getMovements,
  locations,
  partnerStockFor,
  projectProductJourney,
  products,
  receiveAgainstPO,
  recordPartnerSale,
  resetLedgerStorage,
  setMovementIdGenerator,
  transferToPartner,
  upsertPurchaseOrder,
} from "@/lib/domain";
import { buildPurchaseOrder, buildRegistration, resetFixtureSeq } from "@/test/fixtures/builders";
import { StatusChip } from "@/components/ui/StatusChip";
import { JourneyTimeline } from "@/components/network/JourneyTimeline";

/**
 * Lightweight screen-consistency harness: same derived values Inventory / Partner / Dashboard use.
 */
function ConsistencyPanel({ productId }: { productId: string }) {
  const movements = getMovements();
  const snap = deriveInventorySnapshots(
    movements,
    products,
    locations,
    DEFAULT_INVENTORY_LOC,
  ).find((s) => s.productId === productId);
  const partner = partnerStockFor(movements, "partner-freshly", locations).find(
    (s) => s.productId === productId,
  );
  const capital = products.reduce((sum, p) => {
    const s = deriveInventorySnapshots(
      movements,
      products,
      locations,
      DEFAULT_INVENTORY_LOC,
    ).find((x) => x.productId === p.id);
    if (!s) return sum;
    return sum + p.cost * (s.studioStock + s.partnerStock + s.channelStock);
  }, 0);
  const journey = projectProductJourney(productId, movements);

  return (
    <div>
      <p data-testid="studio">{snap?.studioStock ?? 0}</p>
      <p data-testid="partner">{partner?.quantity ?? 0}</p>
      <p data-testid="damaged">{snap?.damaged ?? 0}</p>
      <p data-testid="capital">{capital}</p>
      <p data-testid="journey-count">{journey.length}</p>
      <JourneyTimeline stages={journey} />
      <StatusChip label="Ledger derived" tone="success" />
    </div>
  );
}

describe("screen consistency after writes (RTL)", () => {
  beforeEach(() => {
    resetFixtureSeq();
    resetLedgerStorage();
    window.localStorage.clear();
    let n = 0;
    setMovementIdGenerator(() => `mv-rtl-${++n}`);
  });

  it("14. dashboard / inventory / partner figures stay consistent after writes", () => {
    const productId = "prod-kolam-bottle";
    const { rerender } = render(<ConsistencyPanel productId={productId} />);

    const studio0 = Number(screen.getByTestId("studio").textContent);
    const partner0 = Number(screen.getByTestId("partner").textContent);
    const capital0 = Number(screen.getByTestId("capital").textContent);

    transferToPartner({
      productId,
      partnerId: "partner-freshly",
      quantity: 2,
      reference: "TR-RTL-1",
    });
    rerender(<ConsistencyPanel productId={productId} />);

    expect(Number(screen.getByTestId("studio").textContent)).toBe(studio0 - 2);
    expect(Number(screen.getByTestId("partner").textContent)).toBe(partner0 + 2);
    const capital1 = Number(screen.getByTestId("capital").textContent);
    expect(capital1).toBe(capital0); // transfer conserves on-hand capital pool

    recordPartnerSale({
      productId,
      partnerId: "partner-freshly",
      quantity: 1,
      reference: "PSALE-RTL-1",
    });
    rerender(<ConsistencyPanel productId={productId} />);
    expect(Number(screen.getByTestId("partner").textContent)).toBe(partner0 + 1);

    const cost = products.find((p) => p.id === productId)!.cost;
    expect(Number(screen.getByTestId("capital").textContent)).toBe(capital1 - cost);
  });

  it("receive updates usable vs damage chips consistently", async () => {
    const user = userEvent.setup();
    const po = upsertPurchaseOrder(
      buildPurchaseOrder({
        id: "PO-RTL-1",
        productId: "prod-chennai-tote",
        quantityOrdered: 20,
        status: "Sent",
      }),
    );
    const { rerender } = render(<ConsistencyPanel productId={po.productId} />);
    const studio0 = Number(screen.getByTestId("studio").textContent);
    const damaged0 = Number(screen.getByTestId("damaged").textContent);

    receiveAgainstPO({
      poId: po.id,
      accepted: 18,
      damaged: 2,
      missing: 0,
      notes: "rtl",
    });
    rerender(<ConsistencyPanel productId={po.productId} />);

    expect(Number(screen.getByTestId("studio").textContent)).toBe(studio0 + 18);
    expect(Number(screen.getByTestId("damaged").textContent)).toBe(damaged0 + 2);
    expect(balanceAt(deriveBalances(getMovements()), po.productId, LOC.damage)).toBe(
      damaged0 + 2,
    );

    // Journey timeline still renders after registration projection update
    const stages = projectProductJourney(po.productId, getMovements(), [
      buildRegistration({ productId: po.productId, userId: "person-vanipriya" }),
    ]);
    expect(stages.some((s) => s.id === "registered")).toBe(true);
    expect(screen.getByText("Ledger derived")).toBeInTheDocument();
    await user.click(screen.getByText("Ledger derived"));
  });
});
