import {
  canMarkReady,
  campaignTotals,
  computePotentialReadiness,
  computeReadiness,
  lineGap,
  lineNeed,
  lineTotals,
  selectedRecallQty,
  softAvailableForCampaignTarget,
  trueProcurementGap,
} from "@/lib/domain/campaign-planner";
import type {
  Campaign,
  CampaignBoard,
  CampaignLineBoardRow,
  CampaignPartnerRecallStatus,
  CampaignStatus,
  CreateCampaignInput,
  PartnerRecallBreakdown,
  UpdateCampaignInput,
  UpsertCampaignLineItemInput,
  UpsertPartnerRecallInput,
} from "@/lib/domain/campaign-types";
import { studioLedgerAvailable } from "@/lib/domain/channel-reservation";
import { resolvePresentation } from "@/lib/domain/inventory-presentation";
import { balanceAt, deriveBalances } from "@/lib/domain/ledger";
import type { Location, Partner, Product } from "@/lib/domain/types";
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

const RECALL_STATUSES: CampaignPartnerRecallStatus[] = [
  "AVAILABLE_TO_RECALL",
  "DO_NOT_RECALL",
  "RECALL_REQUESTED",
];

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

function partnerHeldAt(
  balances: ReturnType<typeof deriveBalances>,
  productCode: string,
  variantCode: string | null,
  locationId: string,
): number {
  if (variantCode == null) {
    return Math.max(0, balanceAt(balances, productCode, locationId));
  }
  return Math.max(0, balanceAt(balances, productCode, locationId, variantCode));
}

function buildPartnerBreakdown(input: {
  productCode: string;
  variantCode: string | null;
  balances: ReturnType<typeof deriveBalances>;
  partnerLocations: Location[];
  partnersByCode: Map<string, Partner>;
  recallsByPartner: Map<string, { quantity: number; status: CampaignPartnerRecallStatus }>;
}): PartnerRecallBreakdown[] {
  const {
    productCode,
    variantCode,
    balances,
    partnerLocations,
    partnersByCode,
    recallsByPartner,
  } = input;

  const heldByPartner = new Map<string, number>();
  for (const loc of partnerLocations) {
    const partnerCode = loc.partnerId;
    if (!partnerCode) continue;
    const held = partnerHeldAt(balances, productCode, variantCode, loc.id);
    if (held <= 0 && !recallsByPartner.has(partnerCode)) continue;
    heldByPartner.set(partnerCode, (heldByPartner.get(partnerCode) ?? 0) + held);
  }

  // Include recall rows even when partner currently holds 0 (planning history).
  for (const partnerCode of recallsByPartner.keys()) {
    if (!heldByPartner.has(partnerCode)) heldByPartner.set(partnerCode, 0);
  }

  const rows: PartnerRecallBreakdown[] = [];
  for (const [partnerCode, partnerHeld] of heldByPartner) {
    const recall = recallsByPartner.get(partnerCode);
    const status: CampaignPartnerRecallStatus = recall?.status ?? "AVAILABLE_TO_RECALL";
    const rawQty = Math.max(0, Math.floor(recall?.quantity ?? 0));
    const cappedQty = Math.min(rawQty, partnerHeld);
    const selectedQty = Math.min(selectedRecallQty(status, cappedQty), partnerHeld);
    rows.push({
      partnerCode,
      partnerName: partnersByCode.get(partnerCode)?.name ?? partnerCode,
      partnerHeld,
      quantity: cappedQty,
      selectedQty,
      status,
    });
  }

  rows.sort((a, b) => a.partnerName.localeCompare(b.partnerName));
  return rows;
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

/**
 * Plan partner recall for a campaign line. Writes campaign_partner_recalls only —
 * never transfers stock or appends stock_movements.
 */
export async function upsertPartnerRecall(input: UpsertPartnerRecallInput) {
  const r = repo();
  const campaign = await r.getCampaign(input.campaignId);
  if (!campaign) throw new Error("Campaign not found.");

  const partnerCode = input.partnerCode?.trim();
  if (!partnerCode) throw new Error("Partner code is required.");

  const productCode = input.productCode?.trim();
  if (!productCode) throw new Error("Product code is required.");

  if (!RECALL_STATUSES.includes(input.status)) {
    throw new Error("Invalid partner recall status.");
  }

  const quantity = Math.floor(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Recall quantity must be an integer ≥ 0.");
  }

  const variantCode = input.variantCode?.trim() || null;
  const uow = createPostgresUnitOfWork();
  const partner = await uow.partners.getByCode(partnerCode);
  if (!partner) throw new Error("Partner not found.");

  const product = await uow.products.getByCode(productCode);
  if (!product) throw new Error("Product not found in catalog.");
  if (variantCode) {
    const variant = product.variants.find((v) => v.id === variantCode);
    if (!variant) throw new Error("Variant not found on product.");
  }

  // DO_NOT_RECALL may keep qty 0 or store qty as excluded planning note.
  await r.upsertPartnerRecall({
    campaignId: input.campaignId,
    partnerCode,
    productCode,
    variantCode,
    quantity,
    status: input.status,
    notes: input.notes ?? "",
  });

  if (campaign.status === "DRAFT") {
    await r.setStatus(campaign.id, "INVENTORY_PLANNING");
  }

  return getCampaignBoard(input.campaignId);
}

export async function getCampaignBoard(id: string): Promise<CampaignBoard> {
  const r = repo();
  const campaign = await r.getCampaign(id);
  if (!campaign) throw new Error("Campaign not found.");

  const uow = createPostgresUnitOfWork();
  const channelRepo = createChannelReservationRepository();
  const [lineItems, allocations, recalls, products, movements, locations, partners] =
    await Promise.all([
      r.listLineItems(id),
      r.listActiveAllocations(id),
      r.listRecallsForCampaign(id),
      uow.products.list(),
      uow.movements.list(),
      uow.locations.list(),
      uow.partners.list(),
    ]);

  const balances = deriveBalances(movements);
  const partnersByCode = new Map(partners.map((p) => [p.id, p]));
  const partnerLocations = locations.filter((l) => l.kind === "Partner");
  const allocMap = new Map(
    allocations.map((a) => [`${a.productCode}::${a.variantCode ?? ""}`, a.quantity]),
  );

  const recallsByLinePartner = new Map<
    string,
    Map<string, { quantity: number; status: CampaignPartnerRecallStatus }>
  >();
  for (const recall of recalls) {
    const lineKey = `${recall.productCode}::${recall.variantCode ?? ""}`;
    let byPartner = recallsByLinePartner.get(lineKey);
    if (!byPartner) {
      byPartner = new Map();
      recallsByLinePartner.set(lineKey, byPartner);
    }
    byPartner.set(recall.partnerCode, {
      quantity: recall.quantity,
      status: recall.status,
    });
  }

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
    // Soft available for Gap: exclude this campaign's own hold (already counted in allocated).
    // Current = allocated; Need = planned − allocated; Gap = need − softAvailable.
    // Partner recall planning does NOT subtract from Studio soft-available.
    const softExcludingThis = softAvailableForCampaignTarget(
      studioBalance,
      shopifyHolds,
      campaignHolds - allocated,
    );
    const need = lineNeed(line.plannedQuantity, allocated);
    const gap = lineGap(need, softExcludingThis);

    const lineKey = `${line.productCode}::${line.variantCode ?? ""}`;
    const partnerBreakdown = buildPartnerBreakdown({
      productCode: line.productCode,
      variantCode: line.variantCode,
      balances,
      partnerLocations,
      partnersByCode,
      recallsByPartner: recallsByLinePartner.get(lineKey) ?? new Map(),
    });

    const partnerHeldTotal = partnerBreakdown.reduce((sum, p) => sum + p.partnerHeld, 0);
    const selectedForRecall = partnerBreakdown.reduce((sum, p) => sum + p.selectedQty, 0);
    const recallRequested = partnerBreakdown.reduce(
      (sum, p) =>
        sum +
        (p.status === "RECALL_REQUESTED"
          ? Math.min(Math.max(0, p.selectedQty), p.partnerHeld)
          : 0),
      0,
    );
    const lineTrueGap = trueProcurementGap(line.plannedQuantity, allocated, selectedForRecall);
    const potentialGap = lineGap(Math.max(0, need - selectedForRecall), softExcludingThis);

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
      partnerHeldTotal,
      partnerBreakdown,
      selectedForRecall,
      recallRequested,
      currentGap: gap,
      potentialGap,
      trueProcurementGap: lineTrueGap,
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
  const potentialReadiness = computePotentialReadiness(
    lines.map((l) => ({
      planned: l.planned,
      allocated: l.allocated,
      selectedRecall: l.selectedForRecall,
    })),
  );
  const campaignTrueGap = lines.reduce((sum, l) => sum + l.trueProcurementGap, 0);

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
    currentReadiness: readiness,
    potentialReadiness,
    trueProcurementGap: campaignTrueGap,
    canMarkReady: canMarkReady(readiness),
    attributedSales,
  };
}
