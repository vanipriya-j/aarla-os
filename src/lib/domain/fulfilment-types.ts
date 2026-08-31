/**
 * Fulfil Orders — Aarla-owned operational workflow (not Shopify status).
 */

export const FULFILMENT_STATUSES = [
  "received",
  "stock-check",
  "stock-exception",
  "waiting-for-partner-stock",
  "waiting-for-founder-decision",
  "waiting-for-customer",
  "ready-to-pick",
  "ready-to-pack",
  "ready-to-ship",
  "ready-for-handover",
  "ready-for-pickup",
  "dispatched",
  "cancelled",
  "refund-required",
] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

export const FULFILMENT_SHIPPING_METHODS = [
  "delhivery-surface",
  "delhivery-express",
  "store-pickup",
  "local-delivery",
  "alternate-courier",
] as const;
export type FulfilmentShippingMethod = (typeof FULFILMENT_SHIPPING_METHODS)[number];

export const FULFILMENT_TABS = [
  "needs-attention",
  "stock-check",
  "ready-to-pack",
  "ready-to-ship",
  "todays-dispatch",
  "completed",
] as const;
export type FulfilmentTab = (typeof FULFILMENT_TABS)[number];

export const FULFILMENT_TASK_TYPES = [
  "partner-stock-recall",
  "founder-availability-decision",
  "customer-contact",
  "alternate-courier",
  "courier-awb-cost-followup",
  "other",
] as const;
export type FulfilmentTaskType = (typeof FULFILMENT_TASK_TYPES)[number];

export type PhysicalStockStatus = "unchecked" | "found" | "not-found";

export type FounderAvailabilityDecision =
  | "can-arrange"
  | "cannot-arrange"
  | "alternative-possible";

export type CustomerFulfilmentOutcome =
  | "will-wait"
  | "chose-alternative"
  | "refund-cancel"
  | "follow-up-later";

/** Asia/Kolkata operational cut-off (minutes from midnight). */
export const FULFILMENT_CUTOFF_MINUTES_IST = 12 * 60 + 30; // 12:30

/** Only pull Shopify orders this recent into the fulfil workbench (daily packing, not full history). */
export const FULFILMENT_OPEN_ORDER_LOOKBACK_DAYS = 14;

export function fulfilmentStatusLabel(status: FulfilmentStatus): string {
  const labels: Record<FulfilmentStatus, string> = {
    received: "Received",
    "stock-check": "Stock check",
    "stock-exception": "Stock exception",
    "waiting-for-partner-stock": "Waiting for partner stock",
    "waiting-for-founder-decision": "Waiting for founder",
    "waiting-for-customer": "Waiting for customer",
    "ready-to-pick": "Ready to pick",
    "ready-to-pack": "Ready to pack",
    "ready-to-ship": "Ready to ship",
    "ready-for-handover": "Ready for handover",
    "ready-for-pickup": "Ready for pickup",
    dispatched: "Dispatched",
    cancelled: "Cancelled",
    "refund-required": "Refund required",
  };
  return labels[status] ?? status;
}

export function fulfilmentTabLabel(tab: FulfilmentTab): string {
  const labels: Record<FulfilmentTab, string> = {
    "needs-attention": "Needs Attention",
    "stock-check": "Stock Check",
    "ready-to-pack": "Ready to Pack",
    "ready-to-ship": "Ready to Ship",
    "todays-dispatch": "Today's Dispatch",
    completed: "Completed",
  };
  return labels[tab];
}

export function statusesForTab(tab: FulfilmentTab): FulfilmentStatus[] {
  switch (tab) {
    case "needs-attention":
      return [
        "stock-exception",
        "waiting-for-partner-stock",
        "waiting-for-founder-decision",
        "waiting-for-customer",
        "refund-required",
      ];
    case "stock-check":
      return ["received", "stock-check"];
    case "ready-to-pack":
      return ["ready-to-pick", "ready-to-pack"];
    case "ready-to-ship":
      return ["ready-to-ship", "ready-for-pickup"];
    case "todays-dispatch":
      return ["ready-for-handover", "ready-to-ship", "ready-to-pack"];
    case "completed":
      return ["dispatched", "cancelled"];
    default:
      return [];
  }
}

/** IST wall-clock minutes since midnight for a given instant. */
export function istMinutesSinceMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isPastFulfilmentCutoff(now = new Date()): boolean {
  return istMinutesSinceMidnight(now) >= FULFILMENT_CUTOFF_MINUTES_IST;
}

export function istDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type PackingSuggestionItem = {
  code: string;
  label: string;
};

export type PackingSuggestion = {
  cover: string;
  materials: PackingSuggestionItem[];
  notes: string[];
};

export type FreebieSuggestion = {
  productCode: string;
  variantCode: string | null;
  label: string;
  estimatedCost: number | null;
  ruleName: string;
} | null;

export type ShippingDecisionInput = {
  orderAgeDays: number;
  shippingPaid: number | null;
  orderValue: number;
  estimatedContribution: number | null;
  hasPromisedDate: boolean;
  daysUntilPromised: number | null;
  costsComplete: boolean;
};

export type ShippingRecommendation = {
  method: "delhivery-surface" | "delhivery-express";
  reasons: string[];
  incomplete: boolean;
};
