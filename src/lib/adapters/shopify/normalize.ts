import type { OrderExclusionReason } from "@/lib/domain/external-commerce-types";
import type { ShopifyOrderRecord } from "./port";

/** Strip Shopify GID prefix → stable numeric/string id. */
export function shopifyGidToExternalId(gidOrId: string | null | undefined): string | null {
  if (!gidOrId) return null;
  const raw = String(gidOrId).trim();
  if (!raw) return null;
  const parts = raw.split("/");
  return parts[parts.length - 1] || raw;
}

export function classifyOrderValidity(order: ShopifyOrderRecord): {
  isValid: boolean;
  exclusionReason: OrderExclusionReason | null;
} {
  if (order.isTest) {
    return { isValid: false, exclusionReason: "test" };
  }
  if (order.cancelledAt) {
    return { isValid: false, exclusionReason: "cancelled" };
  }
  if (!order.externalCustomerId) {
    return { isValid: false, exclusionReason: "no_customer" };
  }
  const financial = (order.financialStatus ?? "").toUpperCase();
  if (financial === "REFUNDED") {
    return { isValid: false, exclusionReason: "fully_refunded" };
  }
  return { isValid: true, exclusionReason: null };
}

export function computeLatestValidOrderDates(
  orders: Array<{ externalCustomerId: string | null; orderDate: string; isValid: boolean }>,
): Map<string, string> {
  const latest = new Map<string, string>();
  for (const order of orders) {
    if (!order.isValid || !order.externalCustomerId) continue;
    const prev = latest.get(order.externalCustomerId);
    if (!prev || order.orderDate > prev) {
      latest.set(order.externalCustomerId, order.orderDate);
    }
  }
  return latest;
}
