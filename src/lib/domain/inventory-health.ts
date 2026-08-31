/**
 * Deterministic replenishment / inventory-health recommendations.
 * Extends min-stock rules with sales-pace + aging signals.
 */
import type { SalesPaceClass, VariantSalesPace } from "@/lib/domain/inventory-sales-pace";
import type { VariantAging } from "@/lib/domain/inventory-aging";

export type InventoryHealthAction =
  | "replenish-now"
  | "replenish-soon"
  | "healthy"
  | "watch"
  | "hold-replenishment"
  | "do-not-replenish"
  | "review-for-discontinuation"
  | "push-clear";

export type ReplenishmentPolicy = {
  action: "do-not-replenish";
  reason: string;
  note: string | null;
};

export type InventoryHealth = {
  action: InventoryHealthAction;
  why: string[];
  paceClass: SalesPaceClass | null;
};

export function inventoryHealthLabel(action: InventoryHealthAction): string {
  const labels: Record<InventoryHealthAction, string> = {
    "replenish-now": "Replenish now",
    "replenish-soon": "Replenish soon",
    healthy: "Healthy",
    watch: "Watch",
    "hold-replenishment": "Hold replenishment",
    "do-not-replenish": "Do not replenish",
    "review-for-discontinuation": "Review for discontinuation",
    "push-clear": "Push / clear",
  };
  return labels[action];
}

export function computeInventoryHealth(input: {
  studioQty: number;
  partnerQty: number;
  softReserved?: number;
  minQuantity?: number | null;
  pace: VariantSalesPace | null;
  aging: VariantAging | null;
  policy?: ReplenishmentPolicy | null;
  isSeasonalOffSeason?: boolean;
}): InventoryHealth {
  const why: string[] = [];
  const paceClass = input.pace?.classification ?? null;

  if (input.policy?.action === "do-not-replenish") {
    why.push(`Manual policy: do not replenish (${input.policy.reason})`);
    if (input.policy.note) why.push(input.policy.note);
    return { action: "do-not-replenish", why, paceClass };
  }

  if (input.isSeasonalOffSeason) {
    why.push("Seasonal product is off-season — suppress dead-stock replenishment pressure");
    return { action: "watch", why, paceClass };
  }

  const studio = input.studioQty;
  const partner = input.partnerQty;
  const oldest = input.aging?.oldestAgeDays ?? null;
  const slow =
    paceClass === "slow-moving" ||
    paceClass === "stagnant" ||
    paceClass === "insufficient-data";

  if (
    (paceClass === "extremely-fast" || paceClass === "fast-mover") &&
    studio <= 0
  ) {
    why.push(...(input.pace?.why ?? []));
    why.push(`Studio stock is ${studio}; partner holds ${partner}`);
    return { action: "replenish-now", why, paceClass };
  }

  if (
    (paceClass === "extremely-fast" ||
      paceClass === "fast-mover" ||
      paceClass === "consistent-performer") &&
    input.minQuantity != null &&
    studio < input.minQuantity
  ) {
    why.push(`Studio ${studio} is below minimum ${input.minQuantity}`);
    why.push(...(input.pace?.why ?? []).slice(0, 2));
    return { action: "replenish-soon", why, paceClass };
  }

  if (
    paceClass === "stagnant" &&
    oldest != null &&
    oldest >= 180 &&
    studio + partner > 0
  ) {
    why.push(`Oldest inventory ${oldest} days with stagnant sales`);
    return { action: "review-for-discontinuation", why, paceClass };
  }

  if (slow && oldest != null && oldest >= 90 && studio + partner > 0) {
    why.push(`Aging stock (${oldest} days) with weak sales pace`);
    return { action: "push-clear", why, paceClass };
  }

  if (slow && studio + partner >= (input.minQuantity ?? 1)) {
    why.push("Sufficient stock with weak demand — hold replenishment");
    return { action: "hold-replenishment", why, paceClass };
  }

  if (paceClass === "insufficient-data") {
    why.push("Not enough receipt/sales cycle history for a strong call");
    return { action: "watch", why, paceClass };
  }

  why.push("Stock coverage and sales pace look balanced");
  return { action: "healthy", why, paceClass };
}
