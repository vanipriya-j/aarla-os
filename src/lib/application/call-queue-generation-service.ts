import {
  DELIVERY_FOLLOWUP_LOOKBACK_DAYS,
  REENGAGEMENT_LAPSE_DAYS_DEFAULT,
  deliveryFollowUpReason,
  deliveryQueueSourceKey,
  emptyCallQueueGenerationSummary,
  reengagementQueueSourceKey,
  reengagementReason,
  type CallQueueGenerationSummary,
} from "@/lib/domain/customer-calls-types";
import { createCustomerCallsRepository } from "@/lib/infra/repositories/postgres-customer-calls";
import type { CustomerCallsRepository } from "@/lib/repositories/customer-calls";

export type GenerateCallQueuesDeps = {
  repo?: CustomerCallsRepository;
  now?: Date;
  deliveryLookbackDays?: number;
};

/**
 * Rebuild call queues from synced Shopify + Delhivery rows in Postgres.
 * Does not call external APIs. Preserves in-progress / completed / skipped /
 * call-later rows. Retires stale pending rows only when live candidates exist
 * for that segment (so seeded demo queues remain until commerce data lands).
 */
export async function generateCustomerCallQueues(
  deps: GenerateCallQueuesDeps = {},
): Promise<CallQueueGenerationSummary> {
  const repo = deps.repo ?? createCustomerCallsRepository();
  const now = deps.now ?? new Date();
  const summary = emptyCallQueueGenerationSummary();

  const deliverySeg = await repo.getSegmentByType("delivery-follow-up");
  const reengSeg = await repo.getSegmentByType("re-engagement");
  if (!deliverySeg || !reengSeg) {
    throw new Error("Call segments missing — run /setup (migrate + seed) first.");
  }

  const lookback = deps.deliveryLookbackDays ?? DELIVERY_FOLLOWUP_LOOKBACK_DAYS;
  const deliveryCandidates = await repo.listDeliveryFollowUpCandidates(lookback);
  summary.deliveryCandidates = deliveryCandidates.length;

  if (deliveryCandidates.length > 0) {
    const keepKeys: string[] = [];
    for (const row of deliveryCandidates) {
      const sourceKey = deliveryQueueSourceKey(row.externalCustomerId, row.orderNumber);
      keepKeys.push(sourceKey);
      const result = await repo.upsertQueueCandidate({
        segmentId: deliverySeg.id,
        sourceKey,
        externalCustomerId: row.externalCustomerId,
        externalOrderId: row.orderNumber,
        customerName: row.customerName,
        phone: row.phone,
        email: row.email,
        reason: deliveryFollowUpReason(row.deliveredAt, now),
        lastOrderDate: row.orderDate,
        deliveredAt: row.deliveredAt,
        productsSummary: row.productsSummary,
      });
      if (result.created) summary.deliveryCreated += 1;
      else summary.deliveryUpdated += 1;
    }
    summary.deliveryRetired = await repo.retireStalePending(deliverySeg.id, keepKeys);
  }

  const lapseDays = reengSeg.cooldownDays ?? REENGAGEMENT_LAPSE_DAYS_DEFAULT;
  const reengCandidates = await repo.listReengagementCandidates(lapseDays);
  summary.reengagementCandidates = reengCandidates.length;

  if (reengCandidates.length > 0) {
    const keepKeys: string[] = [];
    for (const row of reengCandidates) {
      const sourceKey = reengagementQueueSourceKey(row.externalCustomerId);
      keepKeys.push(sourceKey);
      const result = await repo.upsertQueueCandidate({
        segmentId: reengSeg.id,
        sourceKey,
        externalCustomerId: row.externalCustomerId,
        externalOrderId: row.lastOrderNumber,
        customerName: row.customerName,
        phone: row.phone,
        email: row.email,
        reason: reengagementReason(lapseDays),
        lastOrderDate: row.lastOrderDate,
        deliveredAt: null,
        productsSummary: row.productsSummary,
      });
      if (result.created) summary.reengagementCreated += 1;
      else summary.reengagementUpdated += 1;
    }
    summary.reengagementRetired = await repo.retireStalePending(reengSeg.id, keepKeys);
  }

  return summary;
}
