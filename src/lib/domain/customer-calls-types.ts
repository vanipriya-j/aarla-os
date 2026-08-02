export const CALL_SEGMENT_TYPES = ["delivery-follow-up", "re-engagement"] as const;
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
export type CallOutcome = DeliveryOutcome | ReengagementOutcome;
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
  externalCustomerId: string;
  externalOrderId?: string | null;
  customerName: string;
  phone: string;
  email?: string | null;
  reason: string;
  lastOrderDate?: string | null;
  deliveredAt?: string | null;
  productsSummary?: string | null;
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
