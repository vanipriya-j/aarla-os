"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as svc from "@/lib/application/attendance-service";
import type {
  AddAttendanceStaffInput,
  UpsertAttendanceMarkInput,
} from "@/lib/domain/attendance-types";

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

export async function getAttendanceDayBoardAction(workDateIso?: string) {
  return wrap(() => svc.getAttendanceDayBoard(workDateIso));
}

export async function upsertAttendanceMarkAction(input: UpsertAttendanceMarkInput) {
  return wrap(() => svc.upsertAttendanceMark(input));
}

export async function addAttendanceStaffAction(input: AddAttendanceStaffInput) {
  return wrap(() => svc.addAttendanceStaff(input));
}

export async function deactivateAttendanceStaffAction(staffId: string) {
  return wrap(() => svc.deactivateAttendanceStaff(staffId));
}
