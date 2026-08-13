"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as svc from "@/lib/application/operating-metrics-service";
import type { UpsertManualMetricInput } from "@/lib/domain/operating-metrics-types";

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

export async function getWeeklyBoardAction(weekStartIso?: string) {
  return wrap(() => svc.getWeeklyBoard(weekStartIso));
}

export async function upsertManualMetricAction(input: UpsertManualMetricInput) {
  return wrap(() => svc.upsertManualMetric(input));
}

export async function getOperatingTargetsAction() {
  return wrap(() => svc.getOperatingTargets());
}
