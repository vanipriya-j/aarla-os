/**
 * Deep-link into Manufacture → Needs Making to start a vendor reorder.
 * Multi-product POs are built there / on Vendor Orders after the first line.
 */

export type ManufactureReorderLine = {
  variantId: string;
  quantity: number;
  label?: string;
};

export function manufactureReorderHref(input: {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  label?: string;
  /** Prefill Needs Making filter: all | zero | low */
  filter?: "all" | "zero" | "low";
  /** Multiple size/colour lines for apparel reorder popup */
  lines?: ManufactureReorderLine[];
}): string {
  const params = new URLSearchParams();
  if (input.productId) params.set("make", input.productId);
  if (input.variantId) params.set("variant", input.variantId);
  if (input.quantity != null && Number.isFinite(input.quantity) && input.quantity > 0) {
    params.set("qty", String(Math.max(1, Math.floor(input.quantity))));
  }
  if (input.label?.trim()) params.set("label", input.label.trim());
  if (input.filter && input.filter !== "all") params.set("filter", input.filter);
  if (input.lines?.length) {
    const compact = input.lines
      .filter((l) => l.variantId && l.quantity > 0)
      .map((l) => ({
        v: l.variantId,
        q: Math.max(1, Math.floor(l.quantity)),
        ...(l.label?.trim() ? { l: l.label.trim() } : {}),
      }));
    if (compact.length) {
      params.set("lines", JSON.stringify(compact));
    }
  }
  const qs = params.toString();
  return qs ? `/manufacture/needs?${qs}` : "/manufacture/needs";
}

export function parseManufactureReorderLines(
  raw: string | null | undefined,
): ManufactureReorderLine[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as {
          v?: unknown;
          q?: unknown;
          l?: unknown;
          variantId?: unknown;
          quantity?: unknown;
          label?: unknown;
        };
        const variantId = String(row.v ?? row.variantId ?? "").trim();
        const quantity = Number(row.q ?? row.quantity);
        if (!variantId || !Number.isFinite(quantity) || quantity <= 0) return null;
        const label = row.l ?? row.label;
        return {
          variantId,
          quantity: Math.max(1, Math.floor(quantity)),
          ...(typeof label === "string" && label.trim() ? { label: label.trim() } : {}),
        } satisfies ManufactureReorderLine;
      })
      .filter((x): x is ManufactureReorderLine => Boolean(x));
  } catch {
    return [];
  }
}

/** Suggested PO qty when restocking from inventory. */
export function suggestedReorderQty(totalOnHand: number, minQuantity?: number): number {
  const total = Math.max(0, Math.floor(totalOnHand));
  const min = minQuantity != null ? Math.max(0, Math.floor(minQuantity)) : undefined;
  if (total <= 0) return Math.max(20, min ?? 20);
  if (min != null && total < min) return Math.max(10, min * 2 - total);
  return Math.max(10, 20 - total);
}
