import {
  outcomeToQueueStatus,
  type CallSegmentType,
  type CustomerCallQueueItem,
  type CustomerCallSegment,
  type CustomerInteraction,
  type SaveCallOutcomeInput,
} from "@/lib/domain/customer-calls-types";
import type { CustomerCallsRepository } from "@/lib/repositories/customer-calls";

const STAFF = "vyshali";

export class CustomerCallsEngine {
  constructor(private readonly repo: CustomerCallsRepository) {}

  async listSegments(): Promise<CustomerCallSegment[]> {
    return this.repo.listSegments();
  }

  async getWorkspace(segmentType: CallSegmentType) {
    const segment = await this.repo.getSegmentByType(segmentType);
    if (!segment) throw new Error(`Segment not found: ${segmentType}`);
    const queue = await this.repo.listQueue(segment.id, true);
    const counts = await this.repo.dashboardCounts();
    return { segment, queue, counts };
  }

  async dashboard() {
    const [segments, counts] = await Promise.all([
      this.repo.listSegments(),
      this.repo.dashboardCounts(),
    ]);
    return { segments, counts };
  }

  async startCall(queueItemId: string): Promise<{
    item: CustomerCallQueueItem;
    segment: CustomerCallSegment;
    history: CustomerInteraction[];
  }> {
    const item = await this.repo.getQueueItem(queueItemId);
    if (!item) throw new Error("Queue item not found");
    if (await this.repo.isDoNotContact(item.externalCustomerId)) {
      throw new Error("Customer is marked Do Not Contact");
    }
    const updated = await this.repo.updateQueueStatus(queueItemId, "in-progress", STAFF);
    const segments = await this.repo.listSegments();
    const segment = segments.find((s) => s.id === item.segmentId);
    if (!segment) throw new Error("Segment missing for queue item");
    const history = await this.repo.listInteractionsForCustomer(item.externalCustomerId);
    return { item: updated, segment, history };
  }

  async saveOutcome(input: SaveCallOutcomeInput): Promise<{
    interaction: CustomerInteraction;
    item: CustomerCallQueueItem;
  }> {
    const item = await this.repo.getQueueItem(input.queueItemId);
    if (!item) throw new Error("Queue item not found");
    const segments = await this.repo.listSegments();
    const segment = segments.find((s) => s.id === item.segmentId);
    if (!segment) throw new Error("Segment missing");

    if (!input.outcome?.trim()) throw new Error("Outcome is required");

    if (input.outcome === "Issue Reported" && !input.issueType) {
      throw new Error("Issue type is required when an issue is reported");
    }
    if (
      (input.outcome === "Corporate Requirement" ||
        input.outcome === "Personal Gifting Requirement") &&
      !input.notes &&
      !input.requirementType
    ) {
      // allow notes empty but require follow-up or quantity ideally — soft require notes via UI
    }

    const issueRaised = input.outcome === "Issue Reported";
    const requirementType =
      input.outcome === "Corporate Requirement"
        ? "corporate"
        : input.outcome === "Personal Gifting Requirement"
          ? "personal-gifting"
          : input.requirementType ?? null;

    const linkedOrder =
      input.outcome === "Already Purchased"
        ? input.linkedOrderExternalId?.trim() || item.externalOrderId
        : item.externalOrderId;

    const interaction = await this.repo.createInteraction({
      ...input,
      segmentId: item.segmentId,
      externalCustomerId: item.externalCustomerId,
      externalOrderId: linkedOrder,
      purpose: segment.name,
      issueRaised,
      requirementType,
      notes: input.notes,
      createdBy: input.createdBy ?? STAFF,
    });

    if (input.outcome === "Do Not Contact") {
      await this.repo.upsertDoNotContact(
        item.externalCustomerId,
        input.notes ?? "Customer requested no further contact",
      );
      await this.repo.skipCustomerQueues(item.externalCustomerId);
      const skipped = await this.repo.getQueueItem(item.id);
      return { interaction, item: skipped! };
    }

    if (input.outcome === "Already Purchased" && item.sourceKey?.startsWith("abandoned:")) {
      const checkoutExternalId = item.sourceKey.slice("abandoned:".length);
      await this.repo.markAbandonedCheckoutConverted(
        checkoutExternalId,
        input.linkedOrderExternalId?.trim() || null,
      );
    }

    const status = outcomeToQueueStatus(input.outcome);
    const updated = await this.repo.updateQueueStatus(item.id, status, STAFF);
    return { interaction, item: updated };
  }

  async saveAndNext(input: SaveCallOutcomeInput): Promise<{
    interaction: CustomerInteraction;
    item: CustomerCallQueueItem;
    next: CustomerCallQueueItem | null;
    segment: CustomerCallSegment;
    history: CustomerInteraction[];
  }> {
    const saved = await this.saveOutcome(input);
    const next = await this.repo.nextPending(saved.item.segmentId, saved.item.id);
    const segments = await this.repo.listSegments();
    const segment = segments.find((s) => s.id === saved.item.segmentId)!;
    if (!next) {
      return {
        ...saved,
        next: null,
        segment,
        history: [],
      };
    }
    const started = await this.startCall(next.id);
    return {
      ...saved,
      next: started.item,
      segment: started.segment,
      history: started.history,
    };
  }

  async callLater(queueItemId: string, followUpAt: string, notes?: string) {
    return this.saveOutcome({
      queueItemId,
      outcome: "Call Later",
      followUpAt,
      notes,
    });
  }

  async skip(queueItemId: string, notes?: string) {
    const item = await this.repo.getQueueItem(queueItemId);
    if (!item) throw new Error("Queue item not found");
    const segments = await this.repo.listSegments();
    const segment = segments.find((s) => s.id === item.segmentId)!;
    const interaction = await this.repo.createInteraction({
      queueItemId,
      segmentId: item.segmentId,
      externalCustomerId: item.externalCustomerId,
      externalOrderId: item.externalOrderId,
      purpose: segment.name,
      outcome: "Skipped",
      notes: notes ?? "Skipped from queue",
      issueRaised: false,
      createdBy: STAFF,
    });
    const updated = await this.repo.updateQueueStatus(queueItemId, "skipped", STAFF);
    return { interaction, item: updated };
  }

  async history(externalCustomerId: string) {
    return this.repo.listInteractionsForCustomer(externalCustomerId);
  }
}
