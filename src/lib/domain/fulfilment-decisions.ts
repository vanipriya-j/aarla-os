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

const COVER_OPTIONS = [
  "Small ecommerce cover",
  "Medium ecommerce cover",
  "Large ecommerce cover",
] as const;

export type PackingCoverOption = (typeof COVER_OPTIONS)[number];

export const PACKING_COVER_OPTIONS = COVER_OPTIONS;

export const PACKING_EXTRA_MATERIAL_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "thank-you-card", label: "Thank-you card" },
  { code: "bubble-sleeve", label: "Bottle: bubble sleeve" },
  { code: "protective-board", label: "Book: protective board" },
  { code: "butter-paper", label: "Tee: fold + butter paper" },
  { code: "void-fill", label: "Extra void fill" },
  { code: "tissue", label: "Tissue wrap" },
  { code: "sticker-card", label: "Sticker / insert card" },
];

function lineTags(title: string): string[] {
  const t = title.toLowerCase();
  const tags: string[] = [];
  if (t.includes("bottle") || t.includes("tumbler")) tags.push("bottle");
  if (t.includes("book")) tags.push("book");
  if (t.includes("tee") || t.includes("shirt") || t.includes("apparel") || t.includes("tote")) {
    tags.push("apparel");
  }
  if (t.includes("sticker")) tags.push("sticker");
  if (t.includes("brass") || t.includes("ceramic")) tags.push("fragile");
  if (tags.length === 0) tags.push("general");
  return tags;
}

/** Stable packing pattern key so operator overrides can teach future suggestions. */
export function packingLineSignature(lines: LineHint[]): string {
  const totalUnits = lines.reduce((n, l) => n + l.quantity, 0);
  const tags = new Set<string>();
  for (const line of lines) {
    for (const tag of lineTags(line.title)) tags.add(tag);
  }
  const bucket =
    totalUnits >= 4 ? "4plus" : totalUnits >= 2 ? "2to3" : totalUnits === 1 ? "1" : "0";
  return `units:${bucket}|${[...tags].sort().join("+")}`;
}

/**
 * Deterministic packing suggestion — founder overrides are stored separately.
 * No LLM. Optional learned packing from a prior similar override wins.
 */
export function suggestPacking(
  lines: LineHint[],
  learned?: { cover: string; materials: PackingSuggestion["materials"]; note?: string | null } | null,
): PackingSuggestion {
  const signature = packingLineSignature(lines);
  if (learned?.cover) {
    const materials =
      learned.materials?.length > 0
        ? learned.materials
        : [
            { code: "cover", label: learned.cover },
            { code: "thank-you-card", label: "Thank-you card" },
          ];
    const notes = [
      learned.note
        ? `From earlier change: ${learned.note}`
        : "From earlier packing change on a similar order.",
    ];
    return {
      cover: learned.cover,
      materials,
      notes,
      signature,
      learnedFromNote: learned.note ?? null,
    };
  }

  const totalUnits = lines.reduce((n, l) => n + l.quantity, 0);
  const titles = lines.map((l) => l.title.toLowerCase());
  const hasBottle = titles.some((t) => t.includes("bottle") || t.includes("tumbler"));
  const hasBook = titles.some((t) => t.includes("book"));
  const hasApparel = titles.some(
    (t) =>
      t.includes("tee") ||
      t.includes("shirt") ||
      t.includes("apparel") ||
      t.includes("tote"),
  );
  const fragile = hasBottle || titles.some((t) => t.includes("brass") || t.includes("ceramic"));

  const cover: PackingCoverOption =
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

  return { cover, materials, notes, signature, learnedFromNote: null };
}

export function buildPackingActual(input: {
  cover: string;
  materialCodes: string[];
  customMaterials?: string[];
  signature: string;
  reason: string;
}): PackingSuggestion {
  const materials: PackingSuggestion["materials"] = [
    { code: "cover", label: input.cover },
  ];
  for (const opt of PACKING_EXTRA_MATERIAL_OPTIONS) {
    if (input.materialCodes.includes(opt.code)) {
      materials.push(opt);
    }
  }
  for (const custom of input.customMaterials ?? []) {
    const label = custom.trim();
    if (!label) continue;
    materials.push({ code: "custom", label });
  }
  return {
    cover: input.cover,
    materials,
    notes: [input.reason.trim()],
    signature: input.signature,
    learnedFromNote: input.reason.trim(),
  };
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
