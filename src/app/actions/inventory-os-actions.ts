"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as inventoryOs from "@/lib/application/inventory-os-service";
import * as services from "@/lib/application/services";
import { DEFAULT_INVENTORY_LOC } from "@/lib/domain/ledger";
import { ORG_ID, stableId } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

export async function getInventoryProductInsightsAction(productId: string) {
  return wrap(async () => {
    const [products, movements, locations, rules] = await Promise.all([
      services.listProducts(),
      services.listMovements(),
      services.listLocations(),
      services.listReorderRules(),
    ]);
    const product = products.find((p) => p.id === productId);
    if (!product) throw new Error("Product not found");

    const studioId =
      locations.find((l) => l.kind === "Studio")?.id ?? DEFAULT_INVENTORY_LOC.studio;
    const receipts = inventoryOs.extractInboundReceipts(movements, studioId);
    const [sales, softHolds, policies] = await Promise.all([
      inventoryOs.loadMatchedShopifySales(products),
      inventoryOs.loadActiveSoftHolds(products),
      inventoryOs.loadReplenishmentPolicies(),
    ]);

    const insights = product.variants.map((v) => {
      const min =
        rules.find((r) => !r.partnerId && r.productId === product.id && r.variantId === v.id)
          ?.minQuantity ??
        rules.find((r) => !r.partnerId && r.productId === product.id && !r.variantId)
          ?.minQuantity ??
        null;
      const insight = inventoryOs.buildVariantInsight({
        product,
        variantId: v.id,
        movements,
        locations,
        receipts,
        sales,
        softHolds,
        minQuantity: min,
        policy: inventoryOs.policyFor(policies, product.id, v.id),
      });
      return {
        variantId: v.id,
        label: v.label,
        options: v.options ?? {},
        ...insight,
      };
    });

    return { product, insights, locations };
  });
}

export async function getInventoryPaceBoardAction() {
  return wrap(async () => {
    const [products, movements, locations, rules] = await Promise.all([
      services.listProducts(),
      services.listMovements(),
      services.listLocations(),
      services.listReorderRules(),
    ]);
    const studioId =
      locations.find((l) => l.kind === "Studio")?.id ?? DEFAULT_INVENTORY_LOC.studio;
    const receipts = inventoryOs.extractInboundReceipts(movements, studioId);
    const [sales, softHolds, policies] = await Promise.all([
      inventoryOs.loadMatchedShopifySales(products),
      inventoryOs.loadActiveSoftHolds(products),
      inventoryOs.loadReplenishmentPolicies(),
    ]);

    const rows = [];
    for (const product of products) {
      for (const v of product.variants) {
        const min =
          rules.find((r) => !r.partnerId && r.productId === product.id && r.variantId === v.id)
            ?.minQuantity ??
          rules.find((r) => !r.partnerId && r.productId === product.id && !r.variantId)
            ?.minQuantity ??
          null;
        const insight = inventoryOs.buildVariantInsight({
          product,
          variantId: v.id,
          movements,
          locations,
          receipts,
          sales,
          softHolds,
          minQuantity: min,
          policy: inventoryOs.policyFor(policies, product.id, v.id),
        });
        if (insight.availability.total <= 0 && insight.pace.unitsSold90d <= 0) continue;
        rows.push({
          productId: product.id,
          productTitle: product.title,
          category: product.category,
          variantId: v.id,
          variantLabel: v.label,
          studio: insight.availability.studio,
          partner: insight.availability.partner,
          reserved: insight.availability.reserved + insight.availability.softReserved,
          paceLabel: insight.paceLabel,
          healthLabel: insight.healthLabel,
          healthAction: insight.health.action,
          paceClass: insight.pace.classification,
          why: insight.pace.why.slice(0, 2),
          unitsSold30d: insight.pace.unitsSold30d,
          oldestAgeDays: insight.aging.oldestAgeDays,
          valueAtCost: insight.aging.valueAtCost,
          costIncomplete: insight.aging.costIncomplete,
          ageBands: insight.aging.bands,
        });
      }
    }

    rows.sort((a, b) => {
      const rank: Record<string, number> = {
        "extremely-fast": 0,
        "fast-mover": 1,
        "consistent-performer": 2,
        healthy: 3,
        watch: 4,
        "slow-moving": 5,
        stagnant: 6,
        "insufficient-data": 7,
      };
      return (rank[a.paceClass] ?? 9) - (rank[b.paceClass] ?? 9);
    });

    return { rows };
  });
}

export async function startStudioReconciliationAction(input?: {
  startedBy?: string | null;
  notes?: string | null;
}) {
  return wrap(async () => {
    const locations = await services.listLocations();
    const studio = locations.find((l) => l.kind === "Studio");
    if (!studio) throw new Error("Studio location not found");

    const created = await poolQuery<{ id: string }>(
      `insert into inventory_reconciliations
         (organization_id, location_id, scope, status, started_by, notes)
       values ($1, $2, 'eod', 'in_progress', $3, $4)
       returning id`,
      [ORG_ID, stableId(studio.id), input?.startedBy ?? null, input?.notes ?? null],
    );
    const reconciliationId = created[0]!.id;

    const [products, movements] = await Promise.all([
      services.listProducts(),
      services.listMovements(),
    ]);

    for (const product of products) {
      for (const v of product.variants) {
        const avail = inventoryOs.getVariantAvailability({
          movements,
          productId: product.id,
          variantId: v.id,
          locations,
        });
        if (avail.studio <= 0) continue;
        await poolQuery(
          `insert into inventory_reconciliation_items
             (reconciliation_id, product_id, variant_id, system_quantity_snapshot)
           values ($1, $2, $3, $4)`,
          [reconciliationId, stableId(product.id), stableId(v.id), avail.studio],
        );
      }
    }

    return { reconciliationId };
  });
}

export async function listOpenReconciliationsAction() {
  return wrap(async () => {
    const rows = await poolQuery<{
      id: string;
      status: string;
      reconciliation_date: Date | string;
      started_at: Date | string;
      notes: string | null;
    }>(
      `select id, status, reconciliation_date, started_at, notes
       from inventory_reconciliations
       where organization_id = $1
         and status in ('draft', 'in_progress', 'review_required')
       order by started_at desc
       limit 20`,
      [ORG_ID],
    );
    return rows.map((r) => ({
      id: String(r.id),
      status: String(r.status),
      reconciliationDate: String(r.reconciliation_date).slice(0, 10),
      startedAt: r.started_at instanceof Date ? r.started_at.toISOString() : String(r.started_at),
      notes: r.notes,
    }));
  });
}

export async function listReconciliationItemsAction(reconciliationId: string) {
  return wrap(async () => {
    const rows = await poolQuery<{
      id: string;
      product_code: string;
      variant_code: string | null;
      system_quantity_snapshot: number;
      physical_quantity: number | null;
      difference: number | null;
      reason: string | null;
      resolution: string | null;
      notes: string | null;
      product_title: string;
      variant_label: string | null;
    }>(
      `select i.id, p.code as product_code, pv.code as variant_code,
              i.system_quantity_snapshot, i.physical_quantity, i.difference,
              i.reason, i.resolution, i.notes,
              p.title as product_title, pv.label as variant_label
       from inventory_reconciliation_items i
       join products p on p.id = i.product_id
       left join product_variants pv on pv.id = i.variant_id
       where i.reconciliation_id = $1
       order by p.title, pv.label`,
      [reconciliationId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      productId: String(r.product_code),
      variantId: r.variant_code == null ? null : String(r.variant_code),
      productTitle: String(r.product_title),
      variantLabel: r.variant_label == null ? null : String(r.variant_label),
      systemQuantitySnapshot: Number(r.system_quantity_snapshot),
      physicalQuantity: r.physical_quantity == null ? null : Number(r.physical_quantity),
      difference: r.difference == null ? null : Number(r.difference),
      reason: r.reason,
      resolution: r.resolution,
      notes: r.notes,
    }));
  });
}

export async function recordReconciliationCountAction(input: {
  itemId: string;
  physicalQuantity: number;
  reason?: string | null;
  notes?: string | null;
}) {
  return wrap(async () => {
    const existing = await poolQuery<{ system_quantity_snapshot: number }>(
      `select system_quantity_snapshot from inventory_reconciliation_items where id = $1`,
      [input.itemId],
    );
    const systemQty = Number(existing[0]?.system_quantity_snapshot ?? 0);
    const difference = input.physicalQuantity - systemQty;
    await poolQuery(
      `update inventory_reconciliation_items
       set physical_quantity = $2,
           difference = $3,
           reason = $4,
           notes = $5,
           updated_at = now()
       where id = $1`,
      [input.itemId, input.physicalQuantity, difference, input.reason ?? null, input.notes ?? null],
    );
    return { difference };
  });
}

const POLICY_REASONS = [
  "poor_demand",
  "old_collection",
  "low_margin",
  "production_difficulty",
  "quality_issue",
  "seasonal",
  "replaced_by_new_product",
  "other",
] as const;

export type DoNotReplenishReason = (typeof POLICY_REASONS)[number];

export async function setDoNotReplenishPolicyAction(input: {
  productId: string;
  variantId?: string | null;
  reason: DoNotReplenishReason;
  note?: string | null;
  createdBy?: string | null;
}) {
  return wrap(async () => {
    if (!POLICY_REASONS.includes(input.reason)) {
      throw new Error("Invalid policy reason");
    }
    const productUuid = stableId(input.productId);
    const variantUuid = input.variantId ? stableId(input.variantId) : null;
    await poolQuery(
      `delete from inventory_replenishment_policies
       where organization_id = $1
         and product_id = $2
         and action = 'do-not-replenish'
         and (
           ($3::uuid is null and variant_id is null)
           or variant_id = $3
         )`,
      [ORG_ID, productUuid, variantUuid],
    );
    await poolQuery(
      `insert into inventory_replenishment_policies
         (organization_id, product_id, variant_id, action, reason, note, created_by)
       values ($1, $2, $3, 'do-not-replenish', $4, $5, $6)`,
      [
        ORG_ID,
        productUuid,
        variantUuid,
        input.reason,
        input.note ?? null,
        input.createdBy ?? null,
      ],
    );
    return { ok: true as const };
  });
}

export async function clearDoNotReplenishPolicyAction(input: {
  productId: string;
  variantId?: string | null;
}) {
  return wrap(async () => {
    await poolQuery(
      `delete from inventory_replenishment_policies
       where organization_id = $1
         and product_id = $2
         and action = 'do-not-replenish'
         and (
           ($3::uuid is null and variant_id is null)
           or variant_id = $3
         )`,
      [
        ORG_ID,
        stableId(input.productId),
        input.variantId ? stableId(input.variantId) : null,
      ],
    );
    return { ok: true as const };
  });
}
