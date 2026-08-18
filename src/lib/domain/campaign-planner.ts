/**
 * Campaign & Inventory Planner — pure arithmetic.
 * Soft allocation math shares the Studio pool with channel_reservations.
 */

import type {
  CampaignLineItem,
  CampaignLineTotals,
  CampaignPartnerRecallStatus,
  CampaignPlannerTotals,
  CampaignPlanningMode,
  CampaignReadiness,
} from "@/lib/domain/campaign-types";

export function lineInvestment(plannedQuantity: number, unitCost: number): number {
  return Math.max(0, plannedQuantity) * Math.max(0, unitCost);
}

export function potentialRevenue(plannedQuantity: number, sellingPrice: number): number {
  return Math.max(0, plannedQuantity) * Math.max(0, sellingPrice);
}

export function grossProfit(plannedQuantity: number, unitCost: number, sellingPrice: number): number {
  return potentialRevenue(plannedQuantity, sellingPrice) - lineInvestment(plannedQuantity, unitCost);
}

/** Gross margin as a fraction of potential revenue (0 when revenue is 0). */
export function grossMargin(plannedQuantity: number, unitCost: number, sellingPrice: number): number {
  const rev = potentialRevenue(plannedQuantity, sellingPrice);
  if (rev <= 0) return 0;
  return grossProfit(plannedQuantity, unitCost, sellingPrice) / rev;
}

export function lineTotals(line: Pick<CampaignLineItem, "plannedQuantity" | "unitCost" | "sellingPrice">): CampaignLineTotals {
  const investment = lineInvestment(line.plannedQuantity, line.unitCost);
  const rev = potentialRevenue(line.plannedQuantity, line.sellingPrice);
  const gp = rev - investment;
  return {
    investment,
    potentialRevenue: rev,
    grossProfit: gp,
    grossMargin: rev <= 0 ? 0 : gp / rev,
  };
}

/**
 * Campaign-level totals. contributionAfterAds = gross profit before ads − planned ad spend.
 * Never label this "Net Profit".
 */
export function campaignTotals(
  lines: Array<Pick<CampaignLineItem, "plannedQuantity" | "unitCost" | "sellingPrice">>,
  plannedAdSpend: number,
): CampaignPlannerTotals {
  let investment = 0;
  let potentialRev = 0;
  for (const line of lines) {
    const t = lineTotals(line);
    investment += t.investment;
    potentialRev += t.potentialRevenue;
  }
  const grossProfitBeforeAds = potentialRev - investment;
  const ads = Math.max(0, plannedAdSpend);
  return {
    investment,
    potentialRevenue: potentialRev,
    grossProfitBeforeAds,
    plannedAdSpend: ads,
    contributionAfterAds: grossProfitBeforeAds - ads,
  };
}

/**
 * Readiness: ready = Σ min(planned, allocated) per line.
 * missing = required − ready.
 */
export function computeReadiness(
  lines: Array<{ plannedQuantity: number; allocatedQuantity: number }>,
): CampaignReadiness {
  let required = 0;
  let ready = 0;
  for (const line of lines) {
    const planned = Math.max(0, Math.floor(line.plannedQuantity));
    const allocated = Math.max(0, Math.floor(line.allocatedQuantity));
    required += planned;
    ready += Math.min(planned, allocated);
  }
  const missing = Math.max(0, required - ready);
  const readinessPct = required <= 0 ? 0 : Math.round((ready / required) * 100);
  return { required, ready, missing, readinessPct };
}

export function canMarkReady(readiness: CampaignReadiness): boolean {
  return readiness.required > 0 && readiness.missing === 0;
}

/**
 * Soft-available Studio qty for a campaign target =
 * studio ledger − active Shopify channel holds − active campaign holds (all campaigns).
 * Never returns negative.
 */
export function softAvailableForCampaignTarget(
  studioBalance: number,
  shopifyActiveHolds: number,
  campaignActiveHoldsAllCampaigns: number,
): number {
  return Math.max(
    0,
    Math.floor(studioBalance) -
      Math.max(0, Math.floor(shopifyActiveHolds)) -
      Math.max(0, Math.floor(campaignActiveHoldsAllCampaigns)),
  );
}

export function lineNeed(planned: number, allocated: number): number {
  return Math.max(0, Math.floor(planned) - Math.max(0, Math.floor(allocated)));
}

export function lineGap(need: number, studioAvailable: number): number {
  return Math.max(0, Math.floor(need) - Math.max(0, Math.floor(studioAvailable)));
}

/**
 * Qty that counts toward potential readiness from a partner recall row.
 * AVAILABLE_TO_RECALL and RECALL_REQUESTED count; DO_NOT_RECALL = 0.
 */
export function selectedRecallQty(
  status: CampaignPartnerRecallStatus,
  quantity: number,
): number {
  const qty = Math.max(0, Math.floor(quantity));
  if (status === "DO_NOT_RECALL") return 0;
  return qty;
}

/**
 * Potential readiness: Current ready + min(remainingNeed, selectedRecall) per line.
 * Does not change inventory — planning math only.
 */
export function computePotentialReadiness(
  lines: Array<{ planned: number; allocated: number; selectedRecall: number }>,
): CampaignReadiness {
  let required = 0;
  let ready = 0;
  for (const line of lines) {
    const planned = Math.max(0, Math.floor(line.planned));
    const allocated = Math.max(0, Math.floor(line.allocated));
    const selectedRecall = Math.max(0, Math.floor(line.selectedRecall));
    const readyCurrent = Math.min(planned, allocated);
    const remainingNeed = Math.max(0, planned - allocated);
    required += planned;
    ready += readyCurrent + Math.min(remainingNeed, selectedRecall);
  }
  const missing = Math.max(0, required - ready);
  const readinessPct = required <= 0 ? 0 : Math.round((ready / required) * 100);
  return { required, ready, missing, readinessPct };
}

/** Units still to procure after Studio soft-alloc + selected partner recall. */
export function trueProcurementGap(
  planned: number,
  allocated: number,
  selectedRecall: number,
): number {
  return Math.max(
    0,
    Math.floor(planned) -
      Math.max(0, Math.floor(allocated)) -
      Math.max(0, Math.floor(selectedRecall)),
  );
}

/** Helper copy for planning-mode tabs — no auto optimal mix. */
export function planningModeHelper(mode: CampaignPlanningMode): {
  title: string;
  helper: string;
  highlight: "plannedAdSpend" | "targetRevenue" | "investment";
} {
  switch (mode) {
    case "ad_budget":
      return {
        title: "Ad Budget",
        helper:
          "Plan inventory against your planned ad spend. Contribution after ads shows what remains after ads.",
        highlight: "plannedAdSpend",
      };
    case "revenue_target":
      return {
        title: "Revenue Target",
        helper:
          "Use target revenue / orders / AOV as a guide while you build the line mix. No auto-mix.",
        highlight: "targetRevenue",
      };
    case "inventory_investment":
      return {
        title: "Inventory Investment",
        helper:
          "Focus on inventory investment (unit cost × planned qty) and soft allocation readiness.",
        highlight: "investment",
      };
  }
}
