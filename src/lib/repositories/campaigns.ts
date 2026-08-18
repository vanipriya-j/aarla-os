import type {
  Campaign,
  CampaignAllocation,
  CampaignLineItem,
  CampaignPartnerRecall,
  CampaignPartnerRecallStatus,
  CampaignStatus,
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/lib/domain/campaign-types";

export interface InsertCampaignLineItemInput {
  campaignId: string;
  productCode: string;
  variantCode: string | null;
  plannedQuantity: number;
  unitCost: number;
  sellingPrice: number;
  notes: string;
}

export interface InsertCampaignAllocationInput {
  campaignId: string;
  productCode: string;
  variantCode: string | null;
  quantity: number;
}

export interface UpsertCampaignPartnerRecallInput {
  campaignId: string;
  partnerCode: string;
  productCode: string;
  variantCode: string | null;
  quantity: number;
  status: CampaignPartnerRecallStatus;
  notes: string;
}

export interface CampaignAttributedSalesRow {
  revenue: number;
  units: number;
  orderCount: number;
}

export interface CampaignRepository {
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  createCampaign(input: CreateCampaignInput & { code: string }): Promise<Campaign>;
  updateCampaign(id: string, input: UpdateCampaignInput): Promise<Campaign>;
  setStatus(id: string, status: CampaignStatus): Promise<Campaign>;

  listLineItems(campaignId: string): Promise<CampaignLineItem[]>;
  upsertLineItem(input: InsertCampaignLineItemInput): Promise<CampaignLineItem>;
  updateLinePlannedQuantity(
    campaignId: string,
    productCode: string,
    variantCode: string | null,
    plannedQuantity: number,
  ): Promise<CampaignLineItem | null>;

  listActiveAllocations(campaignId: string): Promise<CampaignAllocation[]>;
  getActiveAllocation(
    campaignId: string,
    productCode: string,
    variantCode: string | null,
  ): Promise<CampaignAllocation | null>;
  upsertActiveAllocation(input: InsertCampaignAllocationInput): Promise<CampaignAllocation>;
  releaseAllocation(allocationId: string): Promise<CampaignAllocation | null>;
  reduceActiveAllocation(
    allocationId: string,
    newQuantity: number,
  ): Promise<CampaignAllocation | null>;

  listRecallsForCampaign(campaignId: string): Promise<CampaignPartnerRecall[]>;
  upsertPartnerRecall(input: UpsertCampaignPartnerRecallInput): Promise<CampaignPartnerRecall>;
  deletePartnerRecall?(
    campaignId: string,
    partnerCode: string,
    productCode: string,
    variantCode: string | null,
  ): Promise<boolean>;

  /** Sum of active campaign allocation qty for product (+ optional variant) across ALL campaigns. */
  sumActiveCampaignHolds(productCode: string, variantCode: string | null): Promise<number>;

  /**
   * Weak website/Shopify attribution for LIVE campaigns.
   * Matches valid external_orders line items to catalog SKUs/codes in the date window.
   * Partner sales are not included (external_orders only).
   */
  sumAttributedShopifySales(input: {
    startDate: string;
    endDate: string;
    productCodes: string[];
    skus: string[];
  }): Promise<CampaignAttributedSalesRow>;
}
