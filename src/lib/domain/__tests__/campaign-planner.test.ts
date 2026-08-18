import { describe, expect, it } from "vitest";
import {
  canMarkReady,
  campaignTotals,
  computePotentialReadiness,
  computeReadiness,
  grossMargin,
  grossProfit,
  lineGap,
  lineInvestment,
  lineNeed,
  lineTotals,
  potentialRevenue,
  selectedRecallQty,
  softAvailableForCampaignTarget,
  trueProcurementGap,
} from "@/lib/domain/campaign-planner";

describe("campaign planner arithmetic", () => {
  it("computes line investment, revenue, profit, margin", () => {
    expect(lineInvestment(10, 40)).toBe(400);
    expect(potentialRevenue(10, 100)).toBe(1000);
    expect(grossProfit(10, 40, 100)).toBe(600);
    expect(grossMargin(10, 40, 100)).toBe(0.6);
    expect(grossMargin(0, 40, 100)).toBe(0);
  });

  it("aggregates campaign totals and contribution after ads (not Net Profit)", () => {
    const totals = campaignTotals(
      [
        { plannedQuantity: 10, unitCost: 40, sellingPrice: 100 },
        { plannedQuantity: 5, unitCost: 20, sellingPrice: 80 },
      ],
      200,
    );
    expect(totals.investment).toBe(500);
    expect(totals.potentialRevenue).toBe(1400);
    expect(totals.grossProfitBeforeAds).toBe(900);
    expect(totals.plannedAdSpend).toBe(200);
    expect(totals.contributionAfterAds).toBe(700);
    expect("netProfit" in totals).toBe(false);
  });

  it("lineTotals matches helpers", () => {
    const t = lineTotals({ plannedQuantity: 4, unitCost: 25, sellingPrice: 90 });
    expect(t.investment).toBe(100);
    expect(t.potentialRevenue).toBe(360);
    expect(t.grossProfit).toBe(260);
    expect(t.grossMargin).toBeCloseTo(260 / 360);
  });
});

describe("campaign readiness", () => {
  it("sums min(planned, allocated) as ready", () => {
    const r = computeReadiness([
      { plannedQuantity: 10, allocatedQuantity: 7 },
      { plannedQuantity: 5, allocatedQuantity: 8 },
    ]);
    expect(r.required).toBe(15);
    expect(r.ready).toBe(12); // 7 + 5
    expect(r.missing).toBe(3);
    expect(r.readinessPct).toBe(80);
  });

  it("canMarkReady only when required > 0 and missing === 0", () => {
    expect(canMarkReady({ required: 0, ready: 0, missing: 0, readinessPct: 0 })).toBe(false);
    expect(canMarkReady({ required: 10, ready: 8, missing: 2, readinessPct: 80 })).toBe(false);
    expect(canMarkReady({ required: 10, ready: 10, missing: 0, readinessPct: 100 })).toBe(true);
  });

  it("need and gap helpers", () => {
    expect(lineNeed(10, 3)).toBe(7);
    expect(lineGap(7, 4)).toBe(3);
    expect(lineGap(2, 5)).toBe(0);
  });
});

describe("soft available for campaign target", () => {
  it("subtracts channel and all-campaign holds from studio ledger", () => {
    expect(softAvailableForCampaignTarget(100, 20, 15)).toBe(65);
    expect(softAvailableForCampaignTarget(10, 8, 5)).toBe(0);
    expect(softAvailableForCampaignTarget(50, -1, -2)).toBe(50);
  });
});

describe("partner recall planning math", () => {
  it("selectedRecallQty counts AVAILABLE and REQUESTED; DO_NOT_RECALL is 0", () => {
    expect(selectedRecallQty("AVAILABLE_TO_RECALL", 5)).toBe(5);
    expect(selectedRecallQty("RECALL_REQUESTED", 3)).toBe(3);
    expect(selectedRecallQty("DO_NOT_RECALL", 8)).toBe(0);
    expect(selectedRecallQty("AVAILABLE_TO_RECALL", -2)).toBe(0);
  });

  it("computePotentialReadiness adds min(remainingNeed, selectedRecall) to current ready", () => {
    const r = computePotentialReadiness([
      { planned: 10, allocated: 4, selectedRecall: 5 }, // ready 4 + 5 = 9
      { planned: 6, allocated: 6, selectedRecall: 10 }, // ready 6 + 0 = 6
      { planned: 8, allocated: 2, selectedRecall: 1 }, // ready 2 + 1 = 3
    ]);
    expect(r.required).toBe(24);
    expect(r.ready).toBe(18);
    expect(r.missing).toBe(6);
    expect(r.readinessPct).toBe(75);
  });

  it("trueProcurementGap subtracts allocated and selected recall only", () => {
    expect(trueProcurementGap(10, 3, 4)).toBe(3);
    expect(trueProcurementGap(10, 7, 5)).toBe(0);
    expect(trueProcurementGap(5, 0, 0)).toBe(5);
  });

  it("DO_NOT_RECALL does not improve potential readiness or shrink true gap", () => {
    const selected = selectedRecallQty("DO_NOT_RECALL", 20);
    expect(selected).toBe(0);
    const potential = computePotentialReadiness([
      { planned: 10, allocated: 2, selectedRecall: selected },
    ]);
    expect(potential.ready).toBe(2);
    expect(potential.missing).toBe(8);
    expect(trueProcurementGap(10, 2, selected)).toBe(8);
  });
});
