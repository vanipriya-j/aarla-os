import type {
  CallsDashboardCounts,
  CustomerCallQueueItem,
  CustomerCallSegment,
  CustomerContactPreference,
  CustomerInteraction,
  CallSegmentType,
  QueueItemStatus,
  SaveCallOutcomeInput,
} from "@/lib/domain/customer-calls-types";

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
}
