import type {
  CallsDashboardCounts,
  CustomerCallQueueItem,
  CustomerCallSegment,
  CustomerContactPreference,
  CustomerInteraction,
  CallSegmentType,
  QueueCandidateInput,
  QueueItemStatus,
  SaveCallOutcomeInput,
} from "@/lib/domain/customer-calls-types";

export type DeliveryQueueCandidateRow = {
  externalCustomerId: string;
  customerName: string;
  phone: string;
  email: string | null;
  orderNumber: string;
  orderDate: string | null;
  deliveredAt: string;
  productsSummary: string | null;
};

export type ReengagementQueueCandidateRow = {
  externalCustomerId: string;
  customerName: string;
  phone: string;
  email: string | null;
  lastOrderNumber: string | null;
  lastOrderDate: string | null;
  productsSummary: string | null;
};

export interface CustomerCallsRepository {
  listSegments(): Promise<CustomerCallSegment[]>;
  getSegmentByType(type: CallSegmentType): Promise<CustomerCallSegment | null>;
  listQueue(segmentId: string, activeOnly?: boolean): Promise<CustomerCallQueueItem[]>;
  getQueueItem(id: string): Promise<CustomerCallQueueItem | null>;
  updateQueueStatus(
    id: string,
    status: QueueItemStatus,
    assignedTo?: string | null,
  ): Promise<CustomerCallQueueItem>;
  nextPending(segmentId: string, afterId?: string): Promise<CustomerCallQueueItem | null>;
  skipCustomerQueues(externalCustomerId: string): Promise<void>;
  createInteraction(
    input: SaveCallOutcomeInput & {
      segmentId: string;
      externalCustomerId: string;
      externalOrderId?: string | null;
      purpose: string;
      issueRaised: boolean;
      notes?: string | null;
    },
  ): Promise<CustomerInteraction>;
  listInteractionsForCustomer(externalCustomerId: string): Promise<CustomerInteraction[]>;
  listInteractionsForQueueItem(queueItemId: string): Promise<CustomerInteraction[]>;
  upsertDoNotContact(
    externalCustomerId: string,
    reason?: string | null,
  ): Promise<CustomerContactPreference>;
  isDoNotContact(externalCustomerId: string): Promise<boolean>;
  dashboardCounts(): Promise<CallsDashboardCounts>;
  /** Ensure source_key + unique index exist (safe if migration not yet recorded). */
  ensureQueueSchema(): Promise<void>;
  /** True when Shopify customers/orders or Delhivery shipments exist. */
  hasSyncedCommerce(): Promise<boolean>;
  countShipments(): Promise<number>;
  /** Delhivery-delivered orders eligible for delivery follow-up. */
  listDeliveryFollowUpCandidates(lookbackDays: number): Promise<DeliveryQueueCandidateRow[]>;
  /** Customers whose latest valid order is older than lapseDays. */
  listReengagementCandidates(lapseDays: number): Promise<ReengagementQueueCandidateRow[]>;
  upsertQueueCandidate(
    input: QueueCandidateInput,
  ): Promise<{ created: boolean; item: CustomerCallQueueItem }>;
  /**
   * Remove pending rows in a segment whose source_key is not in keepSourceKeys.
   * Caller should only invoke when keepSourceKeys is non-empty.
   */
  retireStalePending(segmentId: string, keepSourceKeys: string[]): Promise<number>;
  /** Delete pending demo/seed/legacy rows (no interactions) for a segment. */
  clearDemoPending(segmentId: string): Promise<number>;
}
