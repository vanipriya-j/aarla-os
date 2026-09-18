import type { StockMovement } from "@/lib/domain/types";

export type PartnerStockBatchKind = "transfer" | "recall" | "sale";

export type PartnerStockBatchLine = {
  productId: string;
  variantId: string;
  productTitle: string;
  variantLabel: string;
  quantity: number;
};

export type PartnerStockBatchSummary = {
  reference: string;
  kind: PartnerStockBatchKind;
  partnerId: string;
  partnerName: string;
  notes: string;
  lines: PartnerStockBatchLine[];
  totalUnits: number;
  shareText: string;
};

const KIND_PREFIX: Record<PartnerStockBatchKind, string> = {
  transfer: "TR-BATCH",
  recall: "RECALL-BATCH",
  sale: "PSALE-BATCH",
};

/** One shared reference for every line in a studio→partner (etc.) stock batch. */
export function buildPartnerStockBatchReference(
  kind: PartnerStockBatchKind,
  partnerId: string,
  now = new Date(),
): string {
  const partner = partnerId.toUpperCase().replace(/^PARTNER-/, "").replace(/[^A-Z0-9]+/g, "");
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const nonce = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return `${KIND_PREFIX[kind]}-${partner || "P"}-${day}-${nonce}`;
}

export function buildPartnerStockBatchShareText(input: {
  kind: PartnerStockBatchKind;
  partnerName: string;
  reference: string;
  notes?: string;
  lines: Array<{
    productTitle: string;
    variantLabel: string;
    quantity: number;
  }>;
}): string {
  const heading =
    input.kind === "transfer"
      ? `Aarla stock transfer to ${input.partnerName}`
      : input.kind === "recall"
        ? `Aarla stock recall from ${input.partnerName}`
        : `Aarla partner sale · ${input.partnerName}`;

  const rows = input.lines.map((line, i) => {
    const variant =
      line.variantLabel && line.variantLabel !== "No variant"
        ? ` · ${line.variantLabel}`
        : "";
    return `${i + 1}. ${line.productTitle}${variant} × ${line.quantity}`;
  });

  const total = input.lines.reduce((s, l) => s + l.quantity, 0);
  const parts = [
    heading,
    `Batch: ${input.reference}`,
    "",
    ...rows,
    "",
    `Total units: ${total}`,
  ];
  if (input.notes?.trim()) {
    parts.push(`Notes: ${input.notes.trim()}`);
  }
  return parts.join("\n");
}

export function summarizePartnerStockBatch(input: {
  kind: PartnerStockBatchKind;
  partnerId: string;
  partnerName: string;
  reference: string;
  notes?: string;
  lines: PartnerStockBatchLine[];
}): PartnerStockBatchSummary {
  const totalUnits = input.lines.reduce((s, l) => s + l.quantity, 0);
  return {
    reference: input.reference,
    kind: input.kind,
    partnerId: input.partnerId,
    partnerName: input.partnerName,
    notes: input.notes?.trim() || "",
    lines: input.lines,
    totalUnits,
    shareText: buildPartnerStockBatchShareText({
      kind: input.kind,
      partnerName: input.partnerName,
      reference: input.reference,
      notes: input.notes,
      lines: input.lines,
    }),
  };
}

/** Group partner stock movements that share one batch reference. */
export function groupMovementsByBatchReference(
  movements: StockMovement[],
): Map<string, StockMovement[]> {
  const map = new Map<string, StockMovement[]>();
  for (const m of movements) {
    const list = map.get(m.reference) ?? [];
    list.push(m);
    map.set(m.reference, list);
  }
  return map;
}

export function isPartnerStockBatchReference(reference: string): boolean {
  return /^(TR-BATCH|RECALL-BATCH|PSALE-BATCH)-/.test(reference);
}
