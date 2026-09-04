/**
 * Deep-link into Manufacture → Needs Making to start a vendor reorder.
 * Multi-product POs are built there / on Vendor Orders after the first line.
 */

export function manufactureReorderHref(input: {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  label?: string;
  /** Prefill Needs Making filter: all | zero | low */
  filter?: "all" | "zero" | "low";
}): string {
  const params = new URLSearchParams();
  if (input.productId) params.set("make", input.productId);
  if (input.variantId) params.set("variant", input.variantId);
  if (input.quantity != null && Number.isFinite(input.quantity) && input.quantity > 0) {
    params.set("qty", String(Math.max(1, Math.floor(input.quantity))));
  }
  if (input.label?.trim()) params.set("label", input.label.trim());
  if (input.filter && input.filter !== "all") params.set("filter", input.filter);
  const qs = params.toString();
  return qs ? `/manufacture/needs?${qs}` : "/manufacture/needs";
}

/** Suggested PO qty when restocking from inventory. */
export function suggestedReorderQty(totalOnHand: number, minQuantity?: number): number {
  const total = Math.max(0, Math.floor(totalOnHand));
  const min = minQuantity != null ? Math.max(0, Math.floor(minQuantity)) : undefined;
  if (total <= 0) return Math.max(20, min ?? 20);
  if (min != null && total < min) return Math.max(10, min * 2 - total);
  return Math.max(10, 20 - total);
}
