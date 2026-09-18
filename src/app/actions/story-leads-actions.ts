"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as svc from "@/lib/application/story-lead-service";
import type {
  StoryFormKey,
  StoryLeadListFilters,
  StoryPreferredContactMethod,
  UpdateStoryLeadInput,
} from "@/lib/domain/story-lead-types";

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

export async function listStoryLeadsAction(filters?: StoryLeadListFilters) {
  return wrap(() => svc.listStoryLeads(filters));
}

export async function getStoryLeadAction(id: string) {
  return wrap(async () => {
    const lead = await svc.getStoryLead(id);
    if (!lead) throw new Error("Lead not found");
    return lead;
  });
}

export async function updateStoryLeadAction(
  id: string,
  input: UpdateStoryLeadInput,
) {
  return wrap(() => svc.updateStoryLead(id, input));
}

export async function createManualStoryLeadAction(input: {
  formKey: StoryFormKey;
  fullName: string;
  email: string;
  phone?: string | null;
  organisationName?: string | null;
  designation?: string | null;
  preferredContactMethod?: StoryPreferredContactMethod | null;
  storyDescription?: string | null;
  occasionType?: string | null;
  audiences?: string[];
  preferredFormats?: string[];
  targetDate?: string | null;
  quantityRange?: string | null;
  budgetRange?: string | null;
  primaryCity?: string | null;
  discussionTopic?: string | null;
  timeline?: string | null;
  additionalContext?: string | null;
  notes?: string;
}) {
  return wrap(() => svc.createManualStoryLead(input));
}

export async function markStoryLeadWonAction(
  id: string,
  options?: {
    notes?: string;
    createShopifyDraft?: boolean;
    lineTitle?: string;
    quantity?: number;
    unitPrice?: string;
  },
) {
  return wrap(() => svc.markStoryLeadWon(id, options));
}

export async function markStoryLeadLostAction(
  id: string,
  options?: { lostReason?: string | null; notes?: string },
) {
  return wrap(() => svc.markStoryLeadLost(id, options));
}

export async function storyLeadManufactureHrefAction(id: string) {
  return wrap(async () => {
    const lead = await svc.getStoryLead(id);
    if (!lead) throw new Error("Lead not found");
    return svc.storyLeadManufactureHref(lead);
  });
}
