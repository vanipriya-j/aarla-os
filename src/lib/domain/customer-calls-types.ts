export const CALL_SEGMENT_TYPES = [
  "delivery-follow-up",
  "re-engagement",
  "abandoned-cart",
] as const;
export type CallSegmentType = (typeof CALL_SEGMENT_TYPES)[number];

export const QUEUE_STATUSES = [
  "pending",
  "in-progress",
  "completed",
  "call-later",
  "could-not-reach",
  "skipped",
] as const;
export type QueueItemStatus = (typeof QUEUE_STATUSES)[number];

export const DELIVERY_OUTCOMES = [
  "Happy",
  "Issue Reported",
  "Call Later",
  "Could Not Reach",
  "Wrong Number",
] as const;

export const REENGAGEMENT_OUTCOMES = [
  "Interested",
  "Send Website",
  "Send WhatsApp",
  "Corporate Requirement",
  "Personal Gifting Requirement",
  "Call Later",
  "Not Interested",
  "Could Not Reach",
  "Do Not Contact",
] as const;

export const ABANDONED_CART_OUTCOMES = [
  "Interested",
  "Send Checkout Link",
  "Send Website",
  "Call Later",
  "Not Interested",
  "Could Not Reach",
  "Already Purchased",
  "Do Not Contact",
] as const;

export const ISSUE_TYPES = [
  "damaged product",
  "wrong product",
  "missing item",
  "packaging issue",
  "quality issue",
  "delivery issue",
  "other",
] as const;

export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];
export type ReengagementOutcome = (typeof REENGAGEMENT_OUTCOMES)[number];
export type AbandonedCartOutcome = (typeof ABANDONED_CART_OUTCOMES)[number];
export type CallOutcome =
  | DeliveryOutcome
  | ReengagementOutcome
  | AbandonedCartOutcome;
export type IssueType = (typeof ISSUE_TYPES)[number];

export interface CustomerCallSegment {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  segmentType: CallSegmentType;
  script: string;
  isActive: boolean;
  cooldownDays?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCallQueueItem {
  id: string;
  organizationId: string;
  segmentId: string;
  /** Idempotency key within the segment (e.g. abandoned:1234). Used by the engine to
   *  detect abandoned-cart queue items when saving outcomes. */
  sourceKey?: string;
  externalCustomerId: string;
  externalOrderId?: string | null;
  customerName: string;
  phone: string;
  email?: string | null;
  reason: string;
  lastOrderDate?: string | null;
  deliveredAt?: string | null;
  productsSummary?: string | null;
  checkoutUrl?: string | null;
  cartSubtotal?: number | null;
  cartCurrency?: string | null;
  status: QueueItemStatus;
  assignedTo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInteraction {
  id: string;
  organizationId: string;
  queueItemId: string;
  segmentId: string;
  externalCustomerId: string;
  externalOrderId?: string | null;
  purpose: string;
  outcome: string;
  notes?: string | null;
  followUpAt?: string | null;
  issueRaised: boolean;
  issueType?: string | null;
  requirementType?: string | null;
  approximateQuantity?: number | null;
  createdBy: string;
  createdAt: string;
}

export interface CustomerContactPreference {
  id: string;
  organizationId: string;
  externalCustomerId: string;
  doNotContact: boolean;
  reason?: string | null;
  updatedAt: string;
}

export interface CallsDashboardCounts {
  deliveryPending: number;
  reengagementPending: number;
  abandonedCartPending: number;
  completedToday: number;
  issuesRaised: number;
  followUpsDue: number;
}

export interface SaveCallOutcomeInput {
  queueItemId: string;
  outcome: string;
  notes?: string;
  followUpAt?: string | null;
  issueType?: string | null;
  /** Optional extra issue narrative; merged into notes at persist time. */
  issueNotes?: string | null;
  requirementType?: string | null;
  approximateQuantity?: number | null;
  /** When Already Purchased — optional Shopify order external id. */
  linkedOrderExternalId?: string | null;
  createdBy?: string;
}

export function outcomeToQueueStatus(outcome: string): QueueItemStatus {
  switch (outcome) {
    case "Call Later":
      return "call-later";
    case "Could Not Reach":
      return "could-not-reach";
    case "Do Not Contact":
    case "Wrong Number":
      return "skipped";
    default:
      return "completed";
  }
}

export const DELIVERY_SCRIPT =
  "Hello, this is Vyshali calling from Aarla. I wanted to check whether your order reached you safely and how your experience was with the products.";

export const REENGAGEMENT_SCRIPT =
  "Hello, this is Vyshali calling from Aarla. We wanted to let you know that our Varalakshmi and Navarathri collections are now available. We also offer customised gifting for families and corporates. Please do visit aarla.in when you have a moment.";

export const ABANDONED_CART_SCRIPT =
  "Hello, this is Vyshali calling from Aarla. I noticed you had selected a few products on our website but may not have completed the order. I just wanted to check if you needed any help or had any questions.";

/** Delivered within this many days → delivery follow-up candidate. */
export const DELIVERY_FOLLOWUP_LOOKBACK_DAYS = 120;

/** Default lapse window when segment.cooldownDays is unset. */
export const REENGAGEMENT_LAPSE_DAYS_DEFAULT = 90;

/**
 * Default abandoned-cart lookback + recent-purchase due-diligence window
 * when segment.cooldownDays is unset.
 */
export const ABANDONED_CART_LOOKBACK_DAYS_DEFAULT = 7;

export type QueueCandidateInput = {
  segmentId: string;
  /** Stable idempotency key within a segment (e.g. delivery:1001:#10450). */
  sourceKey: string;
  externalCustomerId: string;
  externalOrderId: string | null;
  customerName: string;
  phone: string;
  email: string | null;
  reason: string;
  lastOrderDate: string | null;
  deliveredAt: string | null;
  productsSummary: string | null;
  checkoutUrl?: string | null;
  cartSubtotal?: number | null;
  cartCurrency?: string | null;
};

export function deliveryQueueSourceKey(
  externalCustomerId: string,
  orderNumber: string,
): string {
  return `delivery:${externalCustomerId}:${orderNumber}`;
}

export function reengagementQueueSourceKey(externalCustomerId: string): string {
  return `reeng:${externalCustomerId}`;
}

export function abandonedCartQueueSourceKey(checkoutExternalId: string): string {
  return `abandoned:${checkoutExternalId}`;
}

export type CallQueueGenerationSummary = {
  deliveryCandidates: number;
  deliveryCreated: number;
  deliveryUpdated: number;
  deliveryRetired: number;
  deliveryMissingPhone: number;
  reengagementCandidates: number;
  reengagementCreated: number;
  reengagementUpdated: number;
  reengagementRetired: number;
  abandonedCartCandidates: number;
  abandonedCartCreated: number;
  abandonedCartUpdated: number;
  abandonedCartRetired: number;
  /** True when synced Shopify/Delhivery rows were present. */
  commercePresent: boolean;
  /** Demo/seed pending rows removed because live commerce exists. */
  seedPendingCleared: number;
  /** Phones filled via targeted Shopify backfill during refresh. */
  phonesEnriched: number;
};

export function emptyCallQueueGenerationSummary(): CallQueueGenerationSummary {
  return {
    deliveryCandidates: 0,
    deliveryCreated: 0,
    deliveryUpdated: 0,
    deliveryRetired: 0,
    deliveryMissingPhone: 0,
    reengagementCandidates: 0,
    reengagementCreated: 0,
    reengagementUpdated: 0,
    reengagementRetired: 0,
    abandonedCartCandidates: 0,
    abandonedCartCreated: 0,
    abandonedCartUpdated: 0,
    abandonedCartRetired: 0,
    commercePresent: false,
    seedPendingCleared: 0,
    phonesEnriched: 0,
  };
}

export function daysSince(iso: string, now = new Date()): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / (24 * 60 * 60 * 1000)));
}

export function deliveryFollowUpReason(deliveredAt: string, now = new Date()): string {
  const days = daysSince(deliveredAt, now);
  if (days <= 0) return "Order delivered today — check experience";
  if (days === 1) return "Order delivered yesterday — check experience";
  return `Order delivered ${days} days ago — check experience`;
}

export function reengagementReason(lapseDays: number): string {
  return `No purchase in ${lapseDays}+ days`;
}

export function abandonedCartReason(
  lastActivityAt: string,
  now = new Date(),
): string {
  const days = daysSince(lastActivityAt, now);
  if (days <= 0) return "Abandoned checkout today";
  if (days === 1) return "Abandoned checkout yesterday";
  return `Abandoned checkout ${days} days ago`;
}
