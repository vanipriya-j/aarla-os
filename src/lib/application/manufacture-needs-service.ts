/**
 * Needs Making — inventory replenishment → production requirements.
 */
import "server-only";
import { computeReplenishment } from "@/lib/domain/inventory-replenishment";
import type { ProductionRequirement } from "@/lib/domain/manufacture-types";
import * as services from "@/lib/application/services";
import {
  listProductionRequirements,
  upsertManualProductionRequirement,
} from "@/lib/infra/repositories/postgres-manufacture";

export async function buildNeedsMakingBoard(): Promise<{
  persisted: ProductionRequirement[];
  fromInventory: Array<{
    productId: string;
    variantId: string | null;
    label: string;
    quantityToProduce: number;
    reason: string;
    available: number;
    kind: string;
  }>;
}> {
  const [products, movements, locations, partners, rules, persisted] = await Promise.all([
    services.listProducts(),
    services.listMovements(),
    services.listLocations(),
    services.listPartners(),
    services.listReorderRules(),
    listProductionRequirements(),
  ]);

  const items = computeReplenishment({
    products,
    movements,
    locations,
    partners,
    rules: rules ?? [],
  });

  const fromInventory = items
    .filter((i) => i.kind === "aarla-low" || i.kind === "global-low")
    .map((i) => {
      const available = i.kind === "aarla-low" ? i.studio : i.total;
      const shortfall = Math.max(1, i.minQuantity - available);
      return {
        productId: i.productId,
        variantId: i.variantId ?? null,
        label: i.label,
        quantityToProduce: shortfall,
        reason:
          i.kind === "aarla-low"
            ? `Studio stock below minimum (${available} < ${i.minQuantity})`
            : `Global on-hand below minimum (${i.total} < ${i.minQuantity})`,
        available,
        kind: i.kind,
      };
    });

  return { persisted: persisted.filter((p) => p.status === "open"), fromInventory };
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
