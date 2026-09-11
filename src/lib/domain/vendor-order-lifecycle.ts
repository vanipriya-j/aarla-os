import type { VendorOrderStatus } from "@/lib/domain/manufacture-types";

/** Finished POs — no cancel / reopen. */
export const TERMINAL_VENDOR_ORDER_STATUSES: ReadonlySet<VendorOrderStatus> = new Set([
  "received",
  "closed",
  "cancelled",
]);

/** Still editable without reopening (add/remove lines). */
export const EDITABLE_VENDOR_ORDER_STATUSES: ReadonlySet<VendorOrderStatus> = new Set([
  "draft",
  "ready_to_send",
]);

/**
 * Statuses where the founder can cancel the PO entirely.
 * Block after stock has started landing (partially received+) and terminals.
 */
export function canCancelVendorOrder(status: VendorOrderStatus): boolean {
  if (TERMINAL_VENDOR_ORDER_STATUSES.has(status)) return false;
  if (status === "partially_received") return false;
  return true;
}

/**
 * Pull a sent/confirmed (etc.) PO back to ready_to_send so lines can be edited
 * and the PDF / WhatsApp send can be done again.
 */
export function canReopenVendorOrderForEdit(status: VendorOrderStatus): boolean {
  if (EDITABLE_VENDOR_ORDER_STATUSES.has(status)) return false;
  if (TERMINAL_VENDOR_ORDER_STATUSES.has(status)) return false;
  if (status === "partially_received") return false;
  return true;
}

export function vendorOrderLifecycleLabel(status: VendorOrderStatus): string {
  return status.replaceAll("_", " ");
}
