import type {
  FreebieSuggestion,
  PackingSuggestion,
  ShippingDecisionInput,
  ShippingRecommendation,
} from "@/lib/domain/fulfilment-types";

type LineHint = {
  title: string;
  quantity: number;
  category?: string | null;
};

/**
 * Deterministic packing suggestion — founder overrides are stored separately.
 * No LLM.
 */
export function suggestPacking(lines: LineHint[]): PackingSuggestion {
  const totalUnits = lines.reduce((n, l) => n + l.quantity, 0);
  const titles = lines.map((l) => l.title.toLowerCase());
  const hasBottle = titles.some((t) => t.includes("bottle") || t.includes("tumbler"));
  const hasBook = titles.some((t) => t.includes("book"));
  const hasApparel = titles.some(
    (t) => t.includes("tee") || t.includes("shirt") || t.includes("apparel"),
  );
  const fragile = hasBottle || titles.some((t) => t.includes("brass") || t.includes("ceramic"));

  const cover =
    totalUnits >= 4 || (hasBottle && hasBook)
      ? "Large ecommerce cover"
      : totalUnits >= 2 || hasBottle
        ? "Medium ecommerce cover"
        : "Small ecommerce cover";

  const materials: PackingSuggestion["materials"] = [
    { code: "cover", label: cover },
    { code: "thank-you-card", label: "Thank-you card" },
  ];
  if (hasBottle) {
    materials.push({ code: "bubble-sleeve", label: "Bottle: bubble sleeve" });
  }
  if (hasBook) {
    materials.push({ code: "protective-board", label: "Book: protective board" });
  }
  if (hasApparel) {
    materials.push({ code: "butter-paper", label: "Tee: fold + butter paper" });
  }
  if (fragile) {
    materials.push({ code: "void-fill", label: "Extra void fill" });
  }

  const notes: string[] = [];
  if (fragile) notes.push("Fragile items present — pad corners.");
  if (totalUnits === 1) notes.push("Single-item pack.");

  return { cover, materials, notes };
}

export type FreebieRule = {
  name: string;
  minOrderValue: number;
  maxOrderValue: number | null;
  productCode: string;
  variantCode: string | null;
  estimatedCost: number | null;
  priority: number;
  label?: string;
};

export function suggestFreebie(
  orderValue: number,
  rules: FreebieRule[],
  studioAvailableByProduct: Record<string, number>,
): FreebieSuggestion {
  const eligible = [...rules]
    .filter((r) => orderValue >= r.minOrderValue)
    .filter((r) => r.maxOrderValue == null || orderValue <= r.maxOrderValue)
    .sort((a, b) => a.priority - b.priority || b.minOrderValue - a.minOrderValue);

  for (const rule of eligible) {
    const key = rule.variantCode
      ? `${rule.productCode}::${rule.variantCode}`
      : rule.productCode;
    const qty = studioAvailableByProduct[key] ?? studioAvailableByProduct[rule.productCode] ?? 0;
    if (qty < 1) continue;
    return {
      productCode: rule.productCode,
      variantCode: rule.variantCode,
      label: rule.label ?? rule.name,
      estimatedCost: rule.estimatedCost,
      ruleName: rule.name,
    };
  }
  return null;
}

/**
 * Surface is default unless age/urgency/margin clearly support Express.
 * Incomplete costs → incomplete=true; operator must choose manually.
 */
export function recommendShippingMode(
  input: ShippingDecisionInput,
): ShippingRecommendation {
  const reasons: string[] = [];
  reasons.push(`Order age: ${input.orderAgeDays} day(s)`);

  if (!input.costsComplete) {
    reasons.push("Cost inputs incomplete — choose Surface or Express manually.");
    return { method: "delhivery-surface", reasons, incomplete: true };
  }

  let preferExpress = false;

  if (input.orderAgeDays >= 4) {
    preferExpress = true;
    reasons.push("Order pending 4+ days — Express may recover delivery time.");
  } else {
    reasons.push("Order age within Surface window.");
  }

  if (input.daysUntilPromised != null && input.daysUntilPromised <= 2) {
    preferExpress = true;
    reasons.push("Promised date within 2 days.");
  } else if (input.hasPromisedDate) {
    reasons.push("Promised date still allows Surface ETA.");
  }

  if (
    input.estimatedContribution != null &&
    input.estimatedContribution >= 400 &&
    input.orderAgeDays >= 3
  ) {
    preferExpress = true;
    reasons.push("Contribution can absorb Express uplift.");
  } else if (input.estimatedContribution == null) {
    reasons.push("Contribution unknown — not used.");
  } else {
    reasons.push("No strong margin case for Express.");
  }

  if (input.shippingPaid != null && input.shippingPaid > 0) {
    reasons.push(`Customer paid ₹${input.shippingPaid.toFixed(0)} shipping.`);
  }

  if (!preferExpress) {
    reasons.push("Surface is default when ETA and urgency are acceptable.");
  }

  return {
    method: preferExpress ? "delhivery-express" : "delhivery-surface",
    reasons,
    incomplete: false,
  };
}

export function orderAgeDays(orderDateIso: string, now = new Date()): number {
  const ordered = new Date(orderDateIso);
  if (Number.isNaN(ordered.getTime())) return 0;
  const ms = now.getTime() - ordered.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
