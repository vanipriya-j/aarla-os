import type { QueryResultRow } from "pg";
import {
  STORY_MODULE,
  type CreateStoryLeadInput,
  type StoryFormKey,
  type StoryLeadRecord,
  type StoryLeadStatus,
  type StoryLeadType,
} from "@/lib/domain/story-lead-types";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import type { StoryLeadsRepository } from "@/lib/repositories/story-leads";

type Q = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function mapRow(r: Record<string, unknown>, created: boolean): StoryLeadRecord {
  return {
    id: String(r.id),
    idempotencyKey: String(r.idempotency_key),
    source: String(r.source ?? "gyvft"),
    module: String(r.module ?? STORY_MODULE),
    formKey: String(r.form_key) as StoryFormKey,
    leadType: String(r.lead_type) as StoryLeadType,
    status: String(r.status ?? "new") as StoryLeadStatus,
    submittedAt: iso(r.submitted_at),
    fullName: String(r.full_name ?? ""),
    email: String(r.email ?? ""),
    phone: r.phone == null ? null : String(r.phone),
    organisationName:
      r.organisation_name == null ? null : String(r.organisation_name),
    createdAt: iso(r.created_at),
    created,
  };
}

export function createStoryLeadsRepository(): StoryLeadsRepository {
  const q: Q = poolQuery;

  return {
    async upsertByIdempotencyKey(input: CreateStoryLeadInput) {
      const existing = await q(
        `select * from story_leads
         where organization_id = $1 and idempotency_key = $2`,
        [ORG_ID, input.idempotencyKey],
      );
      if (existing[0]) {
        return mapRow(existing[0], false);
      }

      try {
        const rows = await q(
          `insert into story_leads (
             organization_id, idempotency_key, source, module, form_key, lead_type,
             status, submitted_at,
             full_name, email, phone, organisation_name, designation,
             preferred_contact_method,
             story_description, occasion_type, audiences, preferred_formats,
             target_date, quantity_range, budget_range, primary_city,
             discussion_topic, timeline, additional_context,
             consent_communication, consent_marketing,
             landing_page, referrer, utm_source, utm_medium, utm_campaign,
             attachment_filename, attachment_content_type, attachment_bytes,
             attachment_byte_size, raw_payload
           ) values (
             $1,$2,$3,$4,$5,$6,
             'new',$7,
             $8,$9,$10,$11,$12,
             $13,
             $14,$15,$16::jsonb,$17::jsonb,
             $18,$19,$20,$21,
             $22,$23,$24,
             $25,$26,
             $27,$28,$29,$30,$31,
             $32,$33,$34,
             $35,$36::jsonb
           )
           returning *`,
          [
            ORG_ID,
            input.idempotencyKey,
            input.source,
            input.module,
            input.formKey,
            input.leadType,
            input.submittedAt,
            input.fullName,
            input.email,
            input.phone,
            input.organisationName,
            input.designation,
            input.preferredContactMethod,
            input.storyDescription,
            input.occasionType,
            JSON.stringify(input.audiences),
            JSON.stringify(input.preferredFormats),
            input.targetDate,
            input.quantityRange,
            input.budgetRange,
            input.primaryCity,
            input.discussionTopic,
            input.timeline,
            input.additionalContext,
            input.consentCommunication,
            input.consentMarketing,
            input.landingPage,
            input.referrer,
            input.utmSource,
            input.utmMedium,
            input.utmCampaign,
            input.attachment?.filename ?? null,
            input.attachment?.contentType ?? null,
            input.attachment?.bytes ?? null,
            input.attachment?.byteSize ?? null,
            JSON.stringify(input.rawPayload ?? {}),
          ],
        );
        return mapRow(rows[0]!, true);
      } catch (err) {
        // Race: concurrent insert with same idempotency key.
        const code =
          typeof err === "object" && err && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        if (code === "23505") {
          const again = await q(
            `select * from story_leads
             where organization_id = $1 and idempotency_key = $2`,
            [ORG_ID, input.idempotencyKey],
          );
          if (again[0]) return mapRow(again[0], false);
        }
        throw err;
      }
    },

    async findById(id: string) {
      const rows = await q(
        `select * from story_leads
         where organization_id = $1 and id = $2`,
        [ORG_ID, id],
      );
      if (!rows[0]) return null;
      return mapRow(rows[0], false);
    },
  };
}
