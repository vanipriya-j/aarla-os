/**
 * Inventory OS application services — availability, sales pace, aging, health.
 * Ledger remains SoT; pace/aging are derived.
 */
import {
  getProductAvailability,
  getVariantAvailability,
  type SoftHold,
  variantsMatchingOption,
} from "@/lib/domain/inventory-availability";
import {
  getVariantAging,
  type VariantAging,
} from "@/lib/domain/inventory-aging";
import {
  computeVariantSalesPace,
  salesPaceLabel,
  type InboundReceipt,
  type MatchedSaleLine,
  type VariantSalesPace,
} from "@/lib/domain/inventory-sales-pace";
import {
  computeInventoryHealth,
  inventoryHealthLabel,
  type InventoryHealth,
  type ReplenishmentPolicy,
} from "@/lib/domain/inventory-health";
import type { Location, Product, StockMovement } from "@/lib/domain/types";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";

function isoDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function extractInboundReceipts(
  movements: StockMovement[],
  studioLocationId: string,
): InboundReceipt[] {
  return movements
    .filter(
      (m) =>
        m.toLocationId === studioLocationId &&
        m.fromLocationId !== studioLocationId &&
        (m.movementType === "Purchase Receipt" ||
          m.movementType === "Transfer" ||
          m.movementType === "Adjustment" ||
          m.movementType === "Return"),
    )
    .map((m) => ({
      productId: m.productId,
      variantId: m.variantId ?? "",
      quantity: m.quantity,
      availableOn: isoDay(m.date),
      movementId: m.id,
      reference: m.reference,
    }))
    .filter((r) => r.variantId);
}

/** Best-effort match of Shopify line titles to catalog variants. */
export function matchSaleToVariant(input: {
  products: Product[];
  lineTitle: string;
  variantTitle: string | null;
}): { productId: string; variantId: string } | null {
  const title = input.lineTitle.trim().toLowerCase();
  const variantTitle = (input.variantTitle ?? "").trim().toLowerCase();
  if (!title) return null;

  const product = input.products.find((p) => {
    const pt = p.title.trim().toLowerCase();
    return title === pt || title.includes(pt) || pt.includes(title);
  });
  if (!product) return null;

  if (product.variants.length === 1) {
    return { productId: product.id, variantId: product.variants[0]!.id };
  }

  const bySku = product.variants.find(
    (v) => v.sku && variantTitle && variantTitle.includes(v.sku.toLowerCase()),
  );
  if (bySku) return { productId: product.id, variantId: bySku.id };

  const byLabel = product.variants.find((v) => {
    const label = v.label.toLowerCase();
    return variantTitle && (variantTitle.includes(label) || label.includes(variantTitle));
  });
  if (byLabel) return { productId: product.id, variantId: byLabel.id };

  if (variantTitle) {
    const byOptions = product.variants.find((v) => {
      const opts = Object.values(v.options ?? {}).map((x) => x.toLowerCase());
      return opts.every((o) => variantTitle.includes(o));
    });
    if (byOptions) return { productId: product.id, variantId: byOptions.id };
  }

  return null;
}

export async function loadMatchedShopifySales(
  products: Product[],
): Promise<MatchedSaleLine[]> {
  const rows = await poolQuery<{
    title: string;
    variant_title: string | null;
    quantity: number;
    order_date: Date | string;
  }>(
    `select i.title, i.variant_title, i.quantity, o.order_date
     from external_order_items i
     join external_orders o on o.id = i.external_order_id
     where o.organization_id = $1
       and o.is_valid = true
       and o.cancelled_at is null
     order by o.order_date asc`,
    [ORG_ID],
  );

  const out: MatchedSaleLine[] = [];
  for (const row of rows) {
    const match = matchSaleToVariant({
      products,
      lineTitle: String(row.title ?? ""),
      variantTitle: row.variant_title == null ? null : String(row.variant_title),
    });
    if (!match) continue;
    out.push({
      productId: match.productId,
      variantId: match.variantId,
      quantity: Number(row.quantity) || 0,
      soldOn: isoDay(row.order_date),
    });
  }
  return out;
}

export async function loadActiveSoftHolds(
  products: Product[],
): Promise<SoftHold[]> {
  const byCode = new Map(products.map((p) => [p.sku || p.id, p]));
  const variantByCode = new Map<string, { productId: string; variantId: string }>();
  for (const p of products) {
    for (const v of p.variants) {
      variantByCode.set(v.sku || v.id, { productId: p.id, variantId: v.id });
      variantByCode.set(v.id, { productId: p.id, variantId: v.id });
    }
    byCode.set(p.id, p);
  }

  const holds: SoftHold[] = [];

  try {
    const channel = await poolQuery<{
      product_code: string;
      variant_code: string | null;
      quantity: number;
    }>(
      `select product_code, variant_code, quantity
       from channel_reservations
       where organization_id = $1 and status = 'active'`,
      [ORG_ID],
    );
    for (const row of channel) {
      const v =
        (row.variant_code && variantByCode.get(String(row.variant_code))) ||
        null;
      const p = byCode.get(String(row.product_code));
      if (v) {
        holds.push({
          productId: v.productId,
          variantId: v.variantId,
          quantity: Number(row.quantity) || 0,
        });
      } else if (p && p.variants[0]) {
        holds.push({
          productId: p.id,
          variantId: p.variants[0].id,
          quantity: Number(row.quantity) || 0,
        });
      }
    }
  } catch {
    /* table may be absent before setup */
  }

  try {
    const campaign = await poolQuery<{
      product_code: string;
      variant_code: string | null;
      quantity: number;
    }>(
      `select product_code, variant_code, quantity
       from campaign_allocations
       where organization_id = $1 and status = 'active'`,
      [ORG_ID],
    );
    for (const row of campaign) {
      const v =
        (row.variant_code && variantByCode.get(String(row.variant_code))) ||
        null;
      const p = byCode.get(String(row.product_code));
      if (v) {
        holds.push({
          productId: v.productId,
          variantId: v.variantId,
          quantity: Number(row.quantity) || 0,
        });
      } else if (p && p.variants[0]) {
        holds.push({
          productId: p.id,
          variantId: p.variants[0].id,
          quantity: Number(row.quantity) || 0,
        });
      }
    }
  } catch {
    /* optional */
  }

  return holds;
}

export async function loadReplenishmentPolicies(): Promise<
  Array<{
    productId: string;
    variantId: string | null;
    policy: ReplenishmentPolicy;
  }>
> {
  try {
    const rows = await poolQuery<{
      product_code: string;
      variant_code: string | null;
      reason: string;
      note: string | null;
    }>(
      `select p.code as product_code, pv.code as variant_code, pol.reason, pol.note
       from inventory_replenishment_policies pol
       join products p on p.id = pol.product_id
       left join product_variants pv on pv.id = pol.variant_id
       where pol.organization_id = $1 and pol.action = 'do-not-replenish'`,
      [ORG_ID],
    );
    return rows.map((r) => ({
      productId: String(r.product_code),
      variantId: r.variant_code == null ? null : String(r.variant_code),
      policy: {
        action: "do-not-replenish" as const,
        reason: String(r.reason),
        note: r.note,
      },
    }));
  } catch {
    return [];
  }
}

function policyFor(
  policies: Array<{ productId: string; variantId: string | null; policy: ReplenishmentPolicy }>,
  productId: string,
  variantId: string,
): ReplenishmentPolicy | null {
  const exact = policies.find((p) => p.productId === productId && p.variantId === variantId);
  if (exact) return exact.policy;
  const productLevel = policies.find((p) => p.productId === productId && p.variantId == null);
  return productLevel?.policy ?? null;
}

function isSeasonalOffSeason(
  product: Product & {
    isSeasonal?: boolean;
    seasonActiveMonths?: number[];
  },
  now = new Date(),
): boolean {
  if (!product.isSeasonal) return false;
  const months = product.seasonActiveMonths ?? [];
  if (months.length === 0) return false;
  const month = now.getUTCMonth() + 1;
  return !months.includes(month);
}

export type VariantInventoryInsight = {
  availability: ReturnType<typeof getVariantAvailability>;
  pace: VariantSalesPace;
  aging: VariantAging;
  health: InventoryHealth;
  paceLabel: string;
  healthLabel: string;
};

export function buildVariantInsight(input: {
  product: Product & {
    isSeasonal?: boolean;
    seasonLabel?: string | null;
    seasonActiveMonths?: number[];
    cost: number;
  };
  variantId: string;
  movements: StockMovement[];
  locations: Location[];
  receipts: InboundReceipt[];
  sales: MatchedSaleLine[];
  softHolds: SoftHold[];
  minQuantity?: number | null;
  policy?: ReplenishmentPolicy | null;
}): VariantInventoryInsight {
  const availability = getVariantAvailability({
    movements: input.movements,
    productId: input.product.id,
    variantId: input.variantId,
    locations: input.locations,
    softHolds: input.softHolds,
  });
  const offSeason = isSeasonalOffSeason(input.product);
  const pace = computeVariantSalesPace({
    productId: input.product.id,
    variantId: input.variantId,
    receipts: input.receipts,
    sales: input.sales,
    studioQty: availability.studio,
    isSeasonalOffSeason: offSeason,
  });
  const unitCost =
    input.product.cost != null && input.product.cost > 0 ? input.product.cost : null;
  const aging = getVariantAging({
    movements: input.movements,
    productId: input.product.id,
    variantId: input.variantId,
    locations: input.locations,
    unitCost,
  });
  const health = computeInventoryHealth({
    studioQty: availability.studio,
    partnerQty: availability.partner,
    softReserved: availability.softReserved,
    minQuantity: input.minQuantity,
    pace,
    aging,
    policy: input.policy,
    isSeasonalOffSeason: offSeason,
  });

  return {
    availability,
    pace,
    aging,
    health,
    paceLabel: salesPaceLabel(pace.classification),
    healthLabel: inventoryHealthLabel(health.action),
  };
}

export {
  getProductAvailability,
  getVariantAvailability,
  variantsMatchingOption,
  policyFor,
  extractInboundReceipts as _extractInboundReceipts,
};
