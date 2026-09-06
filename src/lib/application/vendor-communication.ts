/**
 * Pure helpers for vendor order communication (safe for client + tests).
 */

import type { VendorOrder } from "@/lib/domain/manufacture-types";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Format YYYY-MM-DD as "Sept 11, 2026" for vendor-facing copy. */
export function formatVendorFacingDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "as discussed";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return isoDate;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return isoDate;
  return `${MONTHS_SHORT[month - 1]} ${day}, ${year}`;
}

export function prepareWhatsAppMessage(input: {
  order: VendorOrder;
  vendorName: string;
}): string {
  const raw =
    input.order.requestedDeliveryDate ??
    input.order.vendorCommittedDate ??
    null;
  const delivery = raw ? formatVendorFacingDate(raw) : "as discussed";
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
    "Requested delivery:",
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
