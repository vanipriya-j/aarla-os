/**
 * Ingest GYVFT / web form leads into Your Story. Our Telling.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { shopifyAdminDraftOrderUrl } from "@/lib/adapters/shopify/admin-urls";
import { createLiveShopifyConnectorFromEnv } from "@/lib/adapters/shopify/live-graphql-connector";
import {
  STORY_LEAD_MAX_ATTACHMENT_BYTES,
  STORY_MODULE,
  STORY_PREFERRED_CONTACT_METHODS,
  isStoryFormKey,
  storyLeadTypeForFormKey,
  type CreateStoryLeadInput,
  type StoryFormKey,
  type StoryLeadDetail,
  type StoryLeadInboundBody,
  type StoryLeadListFilters,
  type StoryLeadRecord,
  type StoryLeadShopifyDraftResult,
  type StoryPreferredContactMethod,
  type UpdateStoryLeadInput,
} from "@/lib/domain/story-lead-types";
import { storyLeadManufactureHref } from "@/lib/domain/story-lead-manufacture-link";
import { createStoryLeadsRepository } from "@/lib/infra/repositories/postgres-story-leads";
import type { StoryLeadsRepository } from "@/lib/repositories/story-leads";

export { storyLeadManufactureHref };

export type StoryLeadValidationError = {
  code: "validation_error";
  error: string;
  fields?: Record<string, string>;
};

export type IngestStoryLeadResult =
  | { ok: true; lead: StoryLeadRecord; status: 200 | 201 }
  | { ok: false; status: 422; body: StoryLeadValidationError };

function asTrimmedString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function isValidEmail(email: string): boolean {
  // Practical check — not full RFC.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function decodeAttachment(
  attachment: StoryLeadInboundBody["attachment"],
  formKey: string,
):
  | { ok: true; value: CreateStoryLeadInput["attachment"] }
  | { ok: false; error: string } {
  if (attachment == null || typeof attachment !== "object") {
    return { ok: true, value: null };
  }
  if (formKey !== "upload_a_brief") {
    return {
      ok: false,
      error: "attachment is only allowed when form_key is upload_a_brief.",
    };
  }
  const filename = asTrimmedString(attachment.filename);
  const contentType = asTrimmedString(attachment.content_type) || "application/octet-stream";
  const b64 = asTrimmedString(attachment.content_base64);
  if (!filename || !b64) {
    return {
      ok: false,
      error: "attachment requires filename and content_base64.",
    };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, error: "attachment.content_base64 is not valid base64." };
  }
  if (!bytes.length) {
    return { ok: false, error: "attachment content is empty." };
  }
  if (bytes.byteLength > STORY_LEAD_MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `attachment exceeds ${STORY_LEAD_MAX_ATTACHMENT_BYTES} bytes.`,
    };
  }
  return {
    ok: true,
    value: {
      filename,
      contentType,
      bytes,
      byteSize: bytes.byteLength,
    },
  };
}

export function parseStoryLeadInboundBody(
  body: unknown,
):
  | { ok: true; input: CreateStoryLeadInput }
  | { ok: false; body: StoryLeadValidationError } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      body: {
        code: "validation_error",
        error: "Request body must be a JSON object.",
      },
    };
  }
  const raw = body as StoryLeadInboundBody;
  const fields: Record<string, string> = {};

  const idempotencyKey = asTrimmedString(raw.idempotency_key);
  if (!idempotencyKey) fields.idempotency_key = "Required.";

  const formKeyRaw = asTrimmedString(raw.form_key);
  if (!formKeyRaw || !isStoryFormKey(formKeyRaw)) {
    fields.form_key =
      "Must be one of: tell_your_story, become_a_merch_partner, book_a_discovery, upload_a_brief.";
  }

  const moduleRaw = asTrimmedString(raw.module);
  if (moduleRaw && moduleRaw !== STORY_MODULE) {
    fields.module = `Must be "${STORY_MODULE}" when present.`;
  }

  const contact =
    raw.contact && typeof raw.contact === "object" && !Array.isArray(raw.contact)
      ? raw.contact
      : null;
  const fullName = asTrimmedString(contact?.full_name);
  const email = asTrimmedString(contact?.email)?.toLowerCase() ?? null;
  if (!fullName) fields["contact.full_name"] = "Required.";
  if (!email) fields["contact.email"] = "Required.";
  else if (!isValidEmail(email)) fields["contact.email"] = "Invalid email.";

  const preferredRaw = asTrimmedString(contact?.preferred_contact_method);
  let preferredContactMethod: StoryPreferredContactMethod | null = null;
  if (preferredRaw) {
    if (
      (STORY_PREFERRED_CONTACT_METHODS as readonly string[]).includes(preferredRaw)
    ) {
      preferredContactMethod = preferredRaw as StoryPreferredContactMethod;
    } else {
      fields["contact.preferred_contact_method"] =
        "Must be email, phone, whatsapp, or null.";
    }
  }

  let submittedAt = new Date().toISOString();
  const submittedRaw = asTrimmedString(raw.submitted_at);
  if (submittedRaw) {
    const d = new Date(submittedRaw);
    if (Number.isNaN(d.getTime())) {
      fields.submitted_at = "Must be ISO-8601.";
    } else {
      submittedAt = d.toISOString();
    }
  }

  const story =
    raw.story && typeof raw.story === "object" && !Array.isArray(raw.story)
      ? raw.story
      : null;
  const consent =
    raw.consent && typeof raw.consent === "object" && !Array.isArray(raw.consent)
      ? raw.consent
      : null;
  const attribution =
    raw.attribution &&
    typeof raw.attribution === "object" &&
    !Array.isArray(raw.attribution)
      ? raw.attribution
      : null;

  const formKey = formKeyRaw && isStoryFormKey(formKeyRaw) ? formKeyRaw : null;
  const attachmentResult = formKey
    ? decodeAttachment(raw.attachment, formKey)
    : { ok: true as const, value: null };
  if (!attachmentResult.ok) {
    fields.attachment = attachmentResult.error;
  }

  if (Object.keys(fields).length || !idempotencyKey || !formKey || !fullName || !email) {
    return {
      ok: false,
      body: {
        code: "validation_error",
        error: "Validation failed.",
        fields,
      },
    };
  }

  const source = asTrimmedString(raw.source) || "gyvft";

  const input: CreateStoryLeadInput = {
    idempotencyKey,
    source,
    module: STORY_MODULE,
    formKey,
    leadType: storyLeadTypeForFormKey(formKey),
    submittedAt,
    fullName,
    email,
    phone: asTrimmedString(contact?.phone),
    organisationName: asTrimmedString(contact?.organisation_name),
    designation: asTrimmedString(contact?.designation),
    preferredContactMethod,
    storyDescription: asTrimmedString(story?.description),
    occasionType: asTrimmedString(story?.occasion_type),
    audiences: asStringArray(story?.audiences),
    preferredFormats: asStringArray(story?.preferred_formats),
    targetDate: asTrimmedString(story?.target_date),
    quantityRange: asTrimmedString(story?.quantity_range),
    budgetRange: asTrimmedString(story?.budget_range),
    primaryCity: asTrimmedString(story?.primary_city),
    discussionTopic: asTrimmedString(story?.discussion_topic),
    timeline: asTrimmedString(story?.timeline),
    additionalContext: asTrimmedString(story?.additional_context),
    consentCommunication: asBoolean(consent?.communication, false),
    consentMarketing: asBoolean(consent?.marketing, false),
    landingPage: asTrimmedString(attribution?.landing_page),
    referrer: asTrimmedString(attribution?.referrer),
    utmSource: asTrimmedString(attribution?.utm_source),
    utmMedium: asTrimmedString(attribution?.utm_medium),
    utmCampaign: asTrimmedString(attribution?.utm_campaign),
    attachment: attachmentResult.ok ? attachmentResult.value : null,
    rawPayload: body,
  };

  return { ok: true, input };
}

export async function ingestStoryLead(
  body: unknown,
  deps?: { repo?: StoryLeadsRepository },
): Promise<IngestStoryLeadResult> {
  const parsed = parseStoryLeadInboundBody(body);
  if (!parsed.ok) {
    return { ok: false, status: 422, body: parsed.body };
  }
  const repo = deps?.repo ?? createStoryLeadsRepository();
  const lead = await repo.upsertByIdempotencyKey(parsed.input);
  return {
    ok: true,
    lead,
    status: lead.created ? 201 : 200,
  };
}

export async function listStoryLeads(
  filters?: StoryLeadListFilters,
  deps?: { repo?: StoryLeadsRepository },
): Promise<StoryLeadRecord[]> {
  const repo = deps?.repo ?? createStoryLeadsRepository();
  return repo.list(filters);
}

export async function getStoryLead(
  id: string,
  deps?: { repo?: StoryLeadsRepository },
): Promise<StoryLeadDetail | null> {
  const repo = deps?.repo ?? createStoryLeadsRepository();
  return repo.findById(id);
}

export async function updateStoryLead(
  id: string,
  input: UpdateStoryLeadInput,
  deps?: { repo?: StoryLeadsRepository },
): Promise<StoryLeadDetail> {
  const repo = deps?.repo ?? createStoryLeadsRepository();
  if (input.email != null && !isValidEmail(input.email.trim().toLowerCase())) {
    throw new Error("Invalid email.");
  }
  const normalized: UpdateStoryLeadInput = {
    ...input,
    email: input.email != null ? input.email.trim().toLowerCase() : undefined,
    fullName: input.fullName != null ? input.fullName.trim() : undefined,
  };
  if (normalized.fullName !== undefined && !normalized.fullName) {
    throw new Error("Full name is required.");
  }
  return repo.update(id, normalized);
}

/** Manual lead from Aarla OS form (source = aarla_os). */
export async function createManualStoryLead(
  input: {
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
  },
  deps?: { repo?: StoryLeadsRepository },
): Promise<StoryLeadDetail> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) throw new Error("Full name is required.");
  if (!email || !isValidEmail(email)) throw new Error("Valid email is required.");
  if (!isStoryFormKey(input.formKey)) throw new Error("Invalid form key.");

  const repo = deps?.repo ?? createStoryLeadsRepository();
  const idempotencyKey = `aarla-os:${randomUUID()}`;
  const createInput: CreateStoryLeadInput = {
    idempotencyKey,
    source: "aarla_os",
    module: STORY_MODULE,
    formKey: input.formKey,
    leadType: storyLeadTypeForFormKey(input.formKey),
    submittedAt: new Date().toISOString(),
    fullName,
    email,
    phone: asTrimmedString(input.phone),
    organisationName: asTrimmedString(input.organisationName),
    designation: asTrimmedString(input.designation),
    preferredContactMethod: input.preferredContactMethod ?? null,
    storyDescription: asTrimmedString(input.storyDescription),
    occasionType: asTrimmedString(input.occasionType),
    audiences: input.audiences ?? [],
    preferredFormats: input.preferredFormats ?? [],
    targetDate: asTrimmedString(input.targetDate),
    quantityRange: asTrimmedString(input.quantityRange),
    budgetRange: asTrimmedString(input.budgetRange),
    primaryCity: asTrimmedString(input.primaryCity),
    discussionTopic: asTrimmedString(input.discussionTopic),
    timeline: asTrimmedString(input.timeline),
    additionalContext: asTrimmedString(input.additionalContext),
    consentCommunication: true,
    consentMarketing: false,
    landingPage: null,
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    attachment: null,
    rawPayload: { source: "aarla_os", form_key: input.formKey },
  };
  const lead = await repo.upsertByIdempotencyKey(createInput);
  if (input.notes?.trim()) {
    return repo.update(lead.id, { notes: input.notes.trim() });
  }
  const detail = await repo.findById(lead.id);
  if (!detail) throw new Error("Lead created but could not be reloaded.");
  return detail;
}

function parseQuantityHint(range: string | null | undefined): number {
  if (!range?.trim()) return 1;
  const nums = range.match(/\d+/g)?.map((n) => Number(n)) ?? [];
  if (!nums.length) return 1;
  return Math.max(1, Math.floor(nums[nums.length - 1]!));
}

function parseBudgetUnitPrice(range: string | null | undefined): string {
  if (!range?.trim()) return "0.00";
  const cleaned = range.replace(/,/g, "");
  const nums = cleaned.match(/\d+(?:\.\d+)?/g)?.map((n) => Number(n)) ?? [];
  if (!nums.length) return "0.00";
  const value = nums[nums.length - 1]!;
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function draftLineTitle(lead: StoryLeadDetail): string {
  const occasion = lead.occasionType?.trim();
  const org = lead.organisationName?.trim();
  if (occasion && org) return `${occasion} — ${org}`;
  if (occasion) return occasion;
  if (org) return `Story order — ${org}`;
  return `Story order — ${lead.fullName}`;
}

/**
 * Mark lead closed-won and attempt Shopify draft order creation.
 * Soft-fails when Shopify credentials/scopes are missing — lead still wins.
 */
export async function markStoryLeadWon(
  id: string,
  options?: {
    notes?: string;
    createShopifyDraft?: boolean;
    lineTitle?: string;
    quantity?: number;
    unitPrice?: string;
  },
  deps?: {
    repo?: StoryLeadsRepository;
    shopify?: {
      createDraftOrder: NonNullable<
        import("@/lib/adapters/shopify/port").ShopifyConnector["createDraftOrder"]
      >;
    } | null;
  },
): Promise<{
  lead: StoryLeadDetail;
  shopify: StoryLeadShopifyDraftResult;
}> {
  const repo = deps?.repo ?? createStoryLeadsRepository();
  const existing = await repo.findById(id);
  if (!existing) throw new Error("Lead not found");

  let lead = await repo.update(id, {
    status: "won",
    ...(options?.notes != null ? { notes: options.notes } : {}),
    lostReason: null,
  });

  const createShopify = options?.createShopifyDraft !== false;
  if (!createShopify) {
    return {
      lead,
      shopify: {
        draftOrderId: lead.shopifyDraftOrderId,
        draftOrderName: lead.shopifyDraftOrderName,
        draftOrderUrl: lead.shopifyDraftOrderUrl,
        error: null,
        softFailed: false,
      },
    };
  }

  if (lead.shopifyDraftOrderId) {
    return {
      lead,
      shopify: {
        draftOrderId: lead.shopifyDraftOrderId,
        draftOrderName: lead.shopifyDraftOrderName,
        draftOrderUrl: lead.shopifyDraftOrderUrl,
        error: null,
        softFailed: false,
      },
    };
  }

  let shopify =
    deps?.shopify === undefined
      ? (() => {
          const live = createLiveShopifyConnectorFromEnv();
          return live?.createDraftOrder
            ? { createDraftOrder: live.createDraftOrder.bind(live) }
            : null;
        })()
      : deps.shopify;

  if (!shopify) {
    lead = await repo.setShopifyDraftOrder(id, {
      draftOrderId: null,
      draftOrderName: null,
      draftOrderUrl: null,
      error:
        "Shopify credentials missing — lead marked won without a draft order.",
    });
    return {
      lead,
      shopify: {
        draftOrderId: null,
        draftOrderName: null,
        draftOrderUrl: null,
        error: lead.shopifyOrderError,
        softFailed: true,
      },
    };
  }

  const qty = options?.quantity ?? parseQuantityHint(lead.quantityRange);
  const price = options?.unitPrice ?? parseBudgetUnitPrice(lead.budgetRange);
  const title = options?.lineTitle?.trim() || draftLineTitle(lead);

  const result = await shopify.createDraftOrder({
    email: lead.email,
    phone: lead.phone,
    customerName: lead.fullName,
    organisationName: lead.organisationName,
    note: [
      `Aarla Story lead ${lead.id}`,
      lead.storyDescription?.trim() || null,
      lead.additionalContext?.trim() || null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    tags: ["story-lead", lead.formKey, lead.source],
    lineItems: [
      {
        title,
        quantity: qty,
        price,
        custom: true,
      },
    ],
  });

  if (!result.ok) {
    const error =
      result.errors.join("; ") ||
      "Shopify draft order failed — lead still marked won.";
    lead = await repo.setShopifyDraftOrder(id, {
      draftOrderId: null,
      draftOrderName: null,
      draftOrderUrl: null,
      error,
    });
    return {
      lead,
      shopify: {
        draftOrderId: null,
        draftOrderName: null,
        draftOrderUrl: null,
        error,
        softFailed: true,
      },
    };
  }

  const adminUrl = shopifyAdminDraftOrderUrl(result.draftOrderId);
  lead = await repo.setShopifyDraftOrder(id, {
    draftOrderId: result.draftOrderId,
    draftOrderName: result.draftOrderName,
    draftOrderUrl: adminUrl ?? result.invoiceUrl,
    error: null,
  });

  return {
    lead,
    shopify: {
      draftOrderId: lead.shopifyDraftOrderId,
      draftOrderName: lead.shopifyDraftOrderName,
      draftOrderUrl: lead.shopifyDraftOrderUrl,
      error: null,
      softFailed: false,
    },
  };
}

export async function markStoryLeadLost(
  id: string,
  options?: { lostReason?: string | null; notes?: string },
  deps?: { repo?: StoryLeadsRepository },
): Promise<StoryLeadDetail> {
  const repo = deps?.repo ?? createStoryLeadsRepository();
  return repo.update(id, {
    status: "lost",
    lostReason: options?.lostReason ?? null,
    ...(options?.notes != null ? { notes: options.notes } : {}),
  });
}
