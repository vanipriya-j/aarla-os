/**
 * Pure helpers for vendor order communication (safe for client + tests).
 */

import type { VendorOrder } from "@/lib/domain/manufacture-types";

export function prepareWhatsAppMessage(input: {
  order: VendorOrder;
  vendorName: string;
}): string {
  const delivery =
    input.order.requestedDeliveryDate ??
    input.order.vendorCommittedDate ??
    "as discussed";
  return [
    `Hi ${input.vendorName.split(" ")[0] || "there"},`,
    "",
    `Sharing Aarla production order ${input.order.orderNumber}.`,
    "",
    "Please review the attached order and confirm:",
    "",
    "• quantities",
    "• pricing",
    "• committed delivery date",
    "",
    `Requested delivery:`,
    delivery,
    "",
    "Please confirm when received.",
    "",
    "Thank you,",
    "Aarla",
  ].join("\n");
}

export function digitsOnlyPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  return d;
}

export function buildWhatsAppDeepLink(phone: string, message: string): string {
  const num = digitsOnlyPhone(phone);
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}
