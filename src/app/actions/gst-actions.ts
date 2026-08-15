"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as svc from "@/lib/application/gst-reconciliation-service";
import type {
  GstPeriodStatus,
  UpsertPurchaseBillInput,
} from "@/lib/domain/gst-types";
import type { UpsertAccountantSettingsInput } from "@/lib/repositories/gst-reconciliation";

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

export async function getGstBoardAction(financialYear?: string, month?: number) {
  return wrap(() => svc.getGstBoard(financialYear, month));
}

export async function upsertPurchaseBillAction(input: UpsertPurchaseBillInput) {
  return wrap(() => svc.upsertPurchaseBill(input));
}

export async function saveGstSettingsAction(input: UpsertAccountantSettingsInput) {
  return wrap(() => svc.saveSettings(input));
}

export async function setGstPeriodStatusAction(
  financialYear: string,
  month: number,
  status: GstPeriodStatus,
) {
  return wrap(() => svc.setPeriodStatus(financialYear, month, status));
}

export async function generateGstPackAction(input: {
  financialYear: string;
  month: number;
  generatedBy?: string;
}) {
  return wrap(() => svc.generateAccountantPack(input));
}

export async function markGstPackSentAction(input: {
  packId: string;
  recipient: string;
  sentBy?: string;
}) {
  return wrap(() => svc.markPackSent(input));
}

export async function getGstPackDownloadAction(packId: string) {
  return wrap(() => svc.getPackDownload(packId));
}
