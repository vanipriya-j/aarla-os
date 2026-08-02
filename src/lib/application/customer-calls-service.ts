import { CustomerCallsEngine } from "@/lib/engine/customer-calls-engine";
import { createCustomerCallsRepository } from "@/lib/infra/repositories/postgres-customer-calls";
import type { CallSegmentType, SaveCallOutcomeInput } from "@/lib/domain/customer-calls-types";

function engine() {
  return new CustomerCallsEngine(createCustomerCallsRepository());
}

export async function getCustomerCallsDashboard() {
  return engine().dashboard();
}

export async function getCustomerCallsWorkspace(segmentType: CallSegmentType) {
  return engine().getWorkspace(segmentType);
}

export async function startCustomerCall(queueItemId: string) {
  return engine().startCall(queueItemId);
}

export async function saveCustomerCallOutcome(input: SaveCallOutcomeInput) {
  return engine().saveOutcome(input);
}

export async function saveCustomerCallAndNext(input: SaveCallOutcomeInput) {
  return engine().saveAndNext(input);
}

export async function callLaterCustomerCall(
  queueItemId: string,
  followUpAt: string,
  notes?: string,
) {
  return engine().callLater(queueItemId, followUpAt, notes);
}

export async function skipCustomerCall(queueItemId: string, notes?: string) {
  return engine().skip(queueItemId, notes);
}

export async function getCustomerCallHistory(externalCustomerId: string) {
  return engine().history(externalCustomerId);
}
