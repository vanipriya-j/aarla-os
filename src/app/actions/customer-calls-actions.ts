"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as svc from "@/lib/application/customer-calls-service";
import type { CallSegmentType, SaveCallOutcomeInput } from "@/lib/domain/customer-calls-types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

export async function getCustomerCallsDashboardAction() {
  return wrap(() => svc.getCustomerCallsDashboard());
}

export async function getCustomerCallsWorkspaceAction(segmentType: CallSegmentType) {
  return wrap(() => svc.getCustomerCallsWorkspace(segmentType));
}

export async function startCustomerCallAction(queueItemId: string) {
  return wrap(() => svc.startCustomerCall(queueItemId));
}

export async function saveCustomerCallOutcomeAction(input: SaveCallOutcomeInput) {
  return wrap(() => svc.saveCustomerCallOutcome(input));
}

export async function saveCustomerCallAndNextAction(input: SaveCallOutcomeInput) {
  return wrap(() => svc.saveCustomerCallAndNext(input));
}

export async function callLaterCustomerCallAction(
  queueItemId: string,
  followUpAt: string,
  notes?: string,
) {
  return wrap(() => svc.callLaterCustomerCall(queueItemId, followUpAt, notes));
}

export async function skipCustomerCallAction(queueItemId: string, notes?: string) {
  return wrap(() => svc.skipCustomerCall(queueItemId, notes));
}

export async function getCustomerCallHistoryAction(externalCustomerId: string) {
  return wrap(() => svc.getCustomerCallHistory(externalCustomerId));
}
