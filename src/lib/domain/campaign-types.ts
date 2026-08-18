/**
 * Campaign & Inventory Planner — domain types.
 * Ops campaigns (not Universe creative "campaign" nodes).
 */

export type CampaignStatus =
  | "DRAFT"
  | "INVENTORY_PLANNING"
  | "READY"
  | "LIVE"
  | "PAUSED"
  | "COMPLETED";

export type CampaignAllocationStatus = "active" | "released";

/** Planning-mode UI tabs — change helper text / highlight only; no auto mix. */
export type CampaignPlanningMode =
  | "ad_budget"
  | "revenue_target"
  | "inventory_investment";

export interface Campaign {
  id: string;
  code: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dailyAdBudget: number;
  plannedAdSpend: number;
  targetRevenue: number | null;
  targetOrders: number | null;
  targetAov: number | null;
  status: CampaignStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignLineItem {
  id: string;
  campaignId: string;
  productCode: string;
  variantCode: string | null;
  plannedQuantity: number;
  unitCost: number;
  sellingPrice: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignAllocation {
  id: string;
  campaignId: string;
  productCode: string;
  variantCode: string | null;
  quantity: number;
  status: CampaignAllocationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignLineTotals {
  investment: number;
  potentialRevenue: number;
  grossProfit: number;
  grossMargin: number;
}

/** Campaign-level planner totals — never label contribution as "Net Profit". */
export interface CampaignPlannerTotals {
  investment: number;
  potentialRevenue: number;
  grossProfitBeforeAds: number;
  plannedAdSpend: number;
  contributionAfterAds: number;
}

export interface CampaignReadiness {
  required: number;
  ready: number;
  missing: number;
  readinessPct: number;
}

export interface CampaignLineBoardRow {
  lineItem: CampaignLineItem;
  productTitle: string;
  variantLabel: string | null;
  sku: string;
  presentation: "matrix-apparel" | "matrix-art" | "list";
  /** Soft-available Studio qty (ledger − channel holds − all-campaign holds). */
  studioAvailable: number;
  /** Active allocation qty for this campaign × product × variant. */
  allocated: number;
  planned: number;
  need: number;
  gap: number;
  lineTotals: CampaignLineTotals;
}

export interface CampaignAttributedSales {
  /** Website / Shopify attributed only — Partner sales not included. */
  label: string;
  revenue: number;
  units: number;
  orderCount: number;
}

export interface CampaignBoard {
  campaign: Campaign;
  lines: CampaignLineBoardRow[];
  totals: CampaignPlannerTotals;
  readiness: CampaignReadiness;
  canMarkReady: boolean;
  attributedSales: CampaignAttributedSales | null;
}

export interface CreateCampaignInput {
  name: string;
  startDate: string;
  endDate: string;
  dailyAdBudget?: number;
  plannedAdSpend?: number;
  targetRevenue?: number | null;
  targetOrders?: number | null;
  targetAov?: number | null;
  notes?: string;
  code?: string;
}

export interface UpdateCampaignInput {
  name?: string;
  startDate?: string;
  endDate?: string;
  dailyAdBudget?: number;
  plannedAdSpend?: number;
  targetRevenue?: number | null;
  targetOrders?: number | null;
  targetAov?: number | null;
  notes?: string;
}

export interface UpsertCampaignLineItemInput {
  campaignId: string;
  productCode: string;
  variantCode?: string | null;
  plannedQuantity: number;
  unitCost?: number;
  sellingPrice?: number;
  notes?: string;
}
