/**
 * Ingest GYVFT / web form leads into Your Story. Our Telling.
 */
import "server-only";

import {
  STORY_LEAD_MAX_ATTACHMENT_BYTES,
  STORY_MODULE,
  STORY_PREFERRED_CONTACT_METHODS,
  isStoryFormKey,
  storyLeadTypeForFormKey,
  type CreateStoryLeadInput,
  type StoryLeadInboundBody,
  type StoryLeadRecord,
  type StoryPreferredContactMethod,
} from "@/lib/domain/story-lead-types";
import { createStoryLeadsRepository } from "@/lib/infra/repositories/postgres-story-leads";
import type { StoryLeadsRepository } from "@/lib/repositories/story-leads";

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
