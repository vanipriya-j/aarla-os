"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as svc from "@/lib/application/campaign-service";
import type {
  CampaignStatus,
  CreateCampaignInput,
  UpdateCampaignInput,
  UpsertCampaignLineItemInput,
  UpsertPartnerRecallInput,
} from "@/lib/domain/campaign-types";

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

export async function listCampaignsAction() {
  return wrap(() => svc.listCampaigns());
}

export async function getCampaignBoardAction(id: string) {
  return wrap(() => svc.getCampaignBoard(id));
}

export async function createCampaignAction(input: CreateCampaignInput) {
  return wrap(() => svc.createCampaign(input));
}

export async function updateCampaignAction(id: string, input: UpdateCampaignInput) {
  return wrap(() => svc.updateCampaign(id, input));
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus) {
  return wrap(() => svc.setCampaignStatus(id, status));
}

export async function upsertCampaignLineItemAction(input: UpsertCampaignLineItemInput) {
  return wrap(() => svc.upsertLineItem(input));
}

export async function updateLinePlannedQuantityAction(input: {
  campaignId: string;
  productCode: string;
  variantCode?: string | null;
  plannedQuantity: number;
}) {
  return wrap(() => svc.updateLinePlannedQuantity(input));
}

export async function allocateToCampaignAction(input: {
  campaignId: string;
  productCode: string;
  variantCode?: string | null;
  quantity: number;
}) {
  return wrap(() => svc.allocateToCampaign(input));
}

export async function releaseAllocationAction(input: {
  campaignId: string;
  productCode: string;
  variantCode?: string | null;
  reduceTo?: number;
}) {
  return wrap(() => svc.releaseAllocation(input));
}

export async function upsertPartnerRecallAction(input: UpsertPartnerRecallInput) {
  return wrap(() => svc.upsertPartnerRecall(input));
}
