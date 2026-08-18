import {
  canMarkReady,
  campaignTotals,
  computeReadiness,
  lineGap,
  lineNeed,
  lineTotals,
  softAvailableForCampaignTarget,
} from "@/lib/domain/campaign-planner";
import type {
  Campaign,
  CampaignBoard,
  CampaignLineBoardRow,
  CampaignStatus,
  CreateCampaignInput,
  UpdateCampaignInput,
  UpsertCampaignLineItemInput,
} from "@/lib/domain/campaign-types";
import { studioLedgerAvailable } from "@/lib/domain/channel-reservation";
import { resolvePresentation } from "@/lib/domain/inventory-presentation";
import { deriveBalances } from "@/lib/domain/ledger";
import type { Product } from "@/lib/domain/types";
import { LOC_CODES } from "@/lib/engine/business-engine";
import { createCampaignRepository } from "@/lib/infra/repositories/postgres-campaigns";
import { createChannelReservationRepository } from "@/lib/infra/repositories/postgres-channel-reservations";
import { createPostgresUnitOfWork } from "@/lib/infra/repositories/postgres-unit-of-work";
import type { CampaignRepository } from "@/lib/repositories/campaigns";

const ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["INVENTORY_PLANNING", "READY"],
  INVENTORY_PLANNING: ["DRAFT", "READY", "PAUSED"],
  READY: ["INVENTORY_PLANNING", "LIVE", "PAUSED", "DRAFT"],
  LIVE: ["PAUSED", "COMPLETED"],
  PAUSED: ["LIVE", "INVENTORY_PLANNING", "COMPLETED"],
  COMPLETED: [],
};

function repo(): CampaignRepository {
  return createCampaignRepository();
}

function slugCode(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = Date.now().toString(36).slice(-4);
  return `camp-${base || "campaign"}-${suffix}`;
}

function findProduct(products: Product[], productCode: string): Product | undefined {
  return products.find((p) => p.id === productCode);
}

function variantLabel(product: Product | undefined, variantCode: string | null): string | null {
  if (!product || !variantCode) return null;
  return product.variants.find((v) => v.id === variantCode)?.label ?? variantCode;
}

function lineSku(product: Product | undefined, variantCode: string | null): string {
  if (!product) return "";
  if (variantCode) {
    return product.variants.find((v) => v.id === variantCode)?.sku ?? product.sku;
  }
  return product.sku;
}

export async function listCampaigns(): Promise<Campaign[]> {
  return repo().listCampaigns();
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const name = input.name?.trim();
  if (!name) throw new Error("Campaign name is required.");
  if (!input.startDate || !input.endDate) {
    throw new Error("Start and end dates are required.");
  }
  if (input.endDate < input.startDate) {
    throw new Error("End date must be on or after start date.");
  }
  const code = input.code?.trim() || slugCode(name);
  return repo().createCampaign({ ...input, name, code });
}

export async function updateCampaign(id: string, input: UpdateCampaignInput): Promise<Campaign> {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error("End date must be on or after start date.");
  }
  return repo().updateCampaign(id, input);
}

export async function setCampaignStatus(id: string, status: CampaignStatus): Promise<CampaignBoard> {
  const r = repo();
  const current = await r.getCampaign(id);
  if (!current) throw new Error("Campaign not found.");

  const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(status)) {
    throw new Error(`Cannot move campaign from ${current.status} to ${status}.`);
  }

  if (status === "READY") {
    const board = await getCampaignBoard(id);
    if (!board.canMarkReady) {
      throw new Error(
        "Cannot mark Ready until inventory readiness is complete (required > 0 and missing = 0).",
      );
    }
  }

  // LIVE only from READY (go live) or PAUSED (resume) — also enforced by ALLOWED_TRANSITIONS.
  if (status === "LIVE" && current.status !== "READY" && current.status !== "PAUSED") {
    throw new Error("LIVE is only allowed from READY (or resume from PAUSED).");
  }

  await r.setStatus(id, status);
  return getCampaignBoard(id);
}

export async function upsertLineItem(input: UpsertCampaignLineItemInput) {
  const r = repo();
  const campaign = await r.getCampaign(input.campaignId);
  if (!campaign) throw new Error("Campaign not found.");

  const uow = createPostgresUnitOfWork();
  const product = await uow.products.getByCode(input.productCode);
  if (!product) throw new Error("Product not found in catalog.");

  const variantCode = input.variantCode?.trim() || null;
  if (variantCode) {
    const variant = product.variants.find((v) => v.id === variantCode);
    if (!variant) throw new Error("Variant not found on product.");
  }

  const plannedQuantity = Math.max(0, Math.floor(Number(input.plannedQuantity) || 0));
  const unitCost =
    input.unitCost != null && Number.isFinite(input.unitCost)
      ? Number(input.unitCost)
      : product.cost;
  const sellingPrice =
    input.sellingPrice != null && Number.isFinite(input.sellingPrice)
      ? Number(input.sellingPrice)
      : product.sellingPrice;

  await r.upsertLineItem({
    campaignId: input.campaignId,
    productCode: input.productCode,
    variantCode,
    plannedQuantity,
    unitCost,
    sellingPrice,
    notes: input.notes ?? "",
  });

  // Auto-move Draft → Inventory Planning when first line is added
  if (campaign.status === "DRAFT") {
    await r.setStatus(campaign.id, "INVENTORY_PLANNING");
  }

  return getCampaignBoard(input.campaignId);
}

export async function updateLinePlannedQuantity(input: {
  campaignId: string;
  productCode: string;
  variantCode?: string | null;
  plannedQuantity: number;
}) {
  const plannedQuantity = Math.max(0, Math.floor(Number(input.plannedQuantity) || 0));
  const updated = await repo().updateLinePlannedQuantity(
    input.campaignId,
    input.productCode,
    input.variantCode?.trim() || null,
    plannedQuantity,
  );
  if (!updated) throw new Error("Line item not found.");
  return getCampaignBoard(input.campaignId);
}

/**
 * Soft-allocate Studio qty to a campaign. Writes campaign_allocations only —
 * no stock_movements / physical Transfer.
 */
export async function allocateToCampaign(input: {
  campaignId: string;
  productCode: string;
  variantCode?: string | null;
  quantity: number;
}) {
  const quantity = Math.floor(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Allocate quantity must be a positive integer.");
  }

  const r = repo();
  const campaign = await r.getCampaign(input.campaignId);
  if (!campaign) throw new Error("Campaign not found.");

  const productCode = input.productCode;
  const variantCode = input.variantCode?.trim() || null;

  const uow = createPostgresUnitOfWork();
  const channelRepo = createChannelReservationRepository();
  const [products, movements] = await Promise.all([
    uow.products.list(),
    uow.movements.list(),
  ]);
  const product = findProduct(products, productCode);
  if (!product) throw new Error("Product not found.");

  const balances = deriveBalances(movements);
  const studioBalance = studioLedgerAvailable(
    balances,
    products,
    productCode,
    variantCode,
    LOC_CODES.studio,
  );
  const shopifyHolds = await channelRepo.sumActiveQuantity(productCode, variantCode);
  const campaignHolds = await r.sumActiveCampaignHolds(productCode, variantCode);

  // Existing allocation for THIS campaign is already in campaignHolds — when
  // upserting, free that qty so softAvailable reflects replacing the hold.
  const existing = await r.getActiveAllocation(input.campaignId, productCode, variantCode);
  const otherCampaignHolds = campaignHolds - (existing?.quantity ?? 0);
  const softAvailable = softAvailableForCampaignTarget(
    studioBalance,
    shopifyHolds,
    otherCampaignHolds,
  );

  if (quantity > softAvailable) {
    throw new Error(
      `Insufficient soft-available Studio stock (available ${softAvailable}, requested ${quantity}).`,
    );
  }

  await r.upsertActiveAllocation({
    campaignId: input.campaignId,
    productCode,
    variantCode,
    quantity,
  });

  if (campaign.status === "DRAFT") {
    await r.setStatus(campaign.id, "INVENTORY_PLANNING");
  }

  return getCampaignBoard(input.campaignId);
}

export async function releaseAllocation(input: {
  campaignId: string;
  productCode: string;
  variantCode?: string | null;
  /** When set and less than current, reduce qty; otherwise release fully. */
  reduceTo?: number;
}) {
  const r = repo();
  const variantCode = input.variantCode?.trim() || null;
  const existing = await r.getActiveAllocation(input.campaignId, input.productCode, variantCode);
  if (!existing) throw new Error("No active allocation to release.");

  if (input.reduceTo != null && input.reduceTo > 0 && input.reduceTo < existing.quantity) {
    await r.reduceActiveAllocation(existing.id, Math.floor(input.reduceTo));
  } else {
    await r.releaseAllocation(existing.id);
  }
  return getCampaignBoard(input.campaignId);
}

export async function getCampaignBoard(id: string): Promise<CampaignBoard> {
  const r = repo();
  const campaign = await r.getCampaign(id);
  if (!campaign) throw new Error("Campaign not found.");

  const uow = createPostgresUnitOfWork();
  const channelRepo = createChannelReservationRepository();
  const [lineItems, allocations, products, movements] = await Promise.all([
    r.listLineItems(id),
    r.listActiveAllocations(id),
    uow.products.list(),
    uow.movements.list(),
  ]);

  const balances = deriveBalances(movements);
  const allocMap = new Map(
    allocations.map((a) => [`${a.productCode}::${a.variantCode ?? ""}`, a.quantity]),
  );

  const lines: CampaignLineBoardRow[] = [];
  for (const line of lineItems) {
    const product = findProduct(products, line.productCode);
    const presentation = product
      ? resolvePresentation(product)
      : ("list" as const);
    const allocated = allocMap.get(`${line.productCode}::${line.variantCode ?? ""}`) ?? 0;

    const studioBalance = studioLedgerAvailable(
      balances,
      products,
      line.productCode,
      line.variantCode,
      LOC_CODES.studio,
    );
    const [shopifyHolds, campaignHolds] = await Promise.all([
      channelRepo.sumActiveQuantity(line.productCode, line.variantCode),
      r.sumActiveCampaignHolds(line.productCode, line.variantCode),
    ]);
    const studioAvailable = softAvailableForCampaignTarget(
      studioBalance,
      shopifyHolds,
      campaignHolds,
    );
    // Soft available for display includes this campaign's own hold as "used";
    // Current/Need/Gap: Current = allocated; Need = planned − allocated;
    // Gap = need − soft available outside this hold.
    const softExcludingThis = softAvailableForCampaignTarget(
      studioBalance,
      shopifyHolds,
      campaignHolds - allocated,
    );
    const need = lineNeed(line.plannedQuantity, allocated);
    const gap = lineGap(need, softExcludingThis);

    lines.push({
      lineItem: line,
      productTitle: product?.title ?? line.productCode,
      variantLabel: variantLabel(product, line.variantCode),
      sku: lineSku(product, line.variantCode),
      presentation:
        presentation === "auto" ? "list" : presentation,
      studioAvailable: softExcludingThis,
      allocated,
      planned: line.plannedQuantity,
      need,
      gap,
      lineTotals: lineTotals(line),
    });
  }

  const totals = campaignTotals(lineItems, campaign.plannedAdSpend);
  const readiness = computeReadiness(
    lines.map((l) => ({
      plannedQuantity: l.planned,
      allocatedQuantity: l.allocated,
    })),
  );

  let attributedSales = null;
  if (campaign.status === "LIVE" || campaign.status === "COMPLETED" || campaign.status === "PAUSED") {
    const skus = new Set<string>();
    const productCodes = new Set<string>();
    for (const line of lineItems) {
      productCodes.add(line.productCode);
      const product = findProduct(products, line.productCode);
      if (product) {
        skus.add(product.sku);
        if (line.variantCode) {
          const v = product.variants.find((x) => x.id === line.variantCode);
          if (v?.sku) skus.add(v.sku);
        } else {
          for (const v of product.variants) skus.add(v.sku);
        }
      }
    }
    const sales = await r.sumAttributedShopifySales({
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      productCodes: Array.from(productCodes),
      skus: Array.from(skus),
    });
    attributedSales = {
      label: "Website / Shopify attributed (Partner sales not included)",
      revenue: sales.revenue,
      units: sales.units,
      orderCount: sales.orderCount,
    };
  }

  return {
    campaign,
    lines,
    totals,
    readiness,
    canMarkReady: canMarkReady(readiness),
    attributedSales,
  };
}
