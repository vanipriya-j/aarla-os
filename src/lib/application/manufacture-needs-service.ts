/**
 * Needs Making — inventory signals → production requirements.
 * Inventory recommends; Manufacturing executes. Includes zero-stock catalog
 * rows, not only reorder-rule “low” alerts.
 */
import "server-only";
import { computeReplenishment } from "@/lib/domain/inventory-replenishment";
import { buildStockTableRows } from "@/lib/domain/inventory-stock-table";
import type { ProductionRequirement } from "@/lib/domain/manufacture-types";
import * as services from "@/lib/application/services";
import {
  listProductionRequirements,
  upsertManualProductionRequirement,
} from "@/lib/infra/repositories/postgres-manufacture";

export type NeedsMakingItem = {
  productId: string;
  variantId: string | null;
  label: string;
  sku: string;
  quantityToProduce: number;
  reason: string;
  available: number;
  kind: "zero" | "aarla-low" | "global-low" | "manual";
};

const DEFAULT_MAKE_QTY = 20;

export async function buildNeedsMakingBoard(): Promise<{
  persisted: ProductionRequirement[];
  fromInventory: NeedsMakingItem[];
  zeroCount: number;
  lowCount: number;
}> {
  const [products, movements, locations, partners, rules, persisted] = await Promise.all([
    services.listProducts(),
    services.listMovements(),
    services.listLocations(),
    services.listPartners(),
    services.listReorderRules(),
    listProductionRequirements(),
  ]);

  const stockRows = buildStockTableRows({
    products,
    movements,
    locations,
    reorderRules: rules ?? [],
  });

  const byKey = new Map<string, NeedsMakingItem>();

  for (const row of stockRows) {
    if (row.total !== 0) continue;
    const key = `${row.productId}:${row.variantId}`;
    byKey.set(key, {
      productId: row.productId,
      variantId: row.variantId || null,
      label:
        row.variantLabel && row.variantLabel !== "Default"
          ? `${row.productTitle} / ${row.variantLabel}`
          : row.productTitle,
      sku: row.variantSku || row.productSku,
      quantityToProduce: DEFAULT_MAKE_QTY,
      reason: "Zero stock — nothing on hand",
      available: 0,
      kind: "zero",
    });
  }

  const replenishment = computeReplenishment({
    products,
    movements,
    locations,
    partners,
    rules: rules ?? [],
  });

  for (const i of replenishment) {
    if (i.kind !== "aarla-low" && i.kind !== "global-low") continue;
    const available = i.kind === "aarla-low" ? i.studio : i.total;
    const key = `${i.productId}:${i.variantId ?? ""}`;
    // Zero-stock rows already captured; keep zero reason unless this is a stronger low signal with qty
    if (byKey.has(key) && byKey.get(key)!.kind === "zero") continue;
    byKey.set(key, {
      productId: i.productId,
      variantId: i.variantId ?? null,
      label: i.label,
      sku: "",
      quantityToProduce: Math.max(1, i.minQuantity - available),
      reason:
        i.kind === "aarla-low"
          ? `Studio stock below minimum (${available} < ${i.minQuantity})`
          : `Global on-hand below minimum (${i.total} < ${i.minQuantity})`,
      available,
      kind: i.kind,
    });
  }

  const fromInventory = Array.from(byKey.values()).sort((a, b) => {
    const rank = (k: NeedsMakingItem["kind"]) =>
      k === "zero" ? 0 : k === "aarla-low" || k === "global-low" ? 1 : 2;
    return rank(a.kind) - rank(b.kind) || a.label.localeCompare(b.label);
  });

  return {
    persisted: persisted.filter((p) => p.status === "open"),
    fromInventory,
    zeroCount: fromInventory.filter((i) => i.kind === "zero").length,
    lowCount: fromInventory.filter((i) => i.kind === "aarla-low" || i.kind === "global-low")
      .length,
  };
}

export async function createNeedFromInventory(input: {
  productId: string;
  variantId?: string | null;
  quantity: number;
  reason: string;
  suggestedVendorCode?: string | null;
}) {
  return upsertManualProductionRequirement({
    productCode: input.productId,
    variantCode: input.variantId,
    quantityToProduce: input.quantity,
    reason: input.reason,
    suggestedVendorCode: input.suggestedVendorCode,
    priority: "high",
  });
}
