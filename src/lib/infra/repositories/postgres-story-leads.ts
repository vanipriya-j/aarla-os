import type { QueryResultRow } from "pg";
import {
  STORY_MODULE,
  type CreateStoryLeadInput,
  type StoryFormKey,
  type StoryLeadDetail,
  type StoryLeadListFilters,
  type StoryLeadRecord,
  type StoryLeadStatus,
  type StoryLeadType,
  type StoryPreferredContactMethod,
  type UpdateStoryLeadInput,
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

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return iso(value);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}

function mapListRow(r: Record<string, unknown>, created: boolean): StoryLeadRecord {
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
    primaryCity: r.primary_city == null ? null : String(r.primary_city),
    occasionType: r.occasion_type == null ? null : String(r.occasion_type),
    quantityRange: r.quantity_range == null ? null : String(r.quantity_range),
    budgetRange: r.budget_range == null ? null : String(r.budget_range),
    notes: String(r.notes ?? ""),
    shopifyDraftOrderId:
      r.shopify_draft_order_id == null ? null : String(r.shopify_draft_order_id),
    shopifyDraftOrderName:
      r.shopify_draft_order_name == null
        ? null
        : String(r.shopify_draft_order_name),
    shopifyDraftOrderUrl:
      r.shopify_draft_order_url == null ? null : String(r.shopify_draft_order_url),
    shopifyOrderError:
      r.shopify_order_error == null ? null : String(r.shopify_order_error),
    closedAt: isoOrNull(r.closed_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at ?? r.created_at),
    created,
  };
}

function mapDetailRow(r: Record<string, unknown>, created: boolean): StoryLeadDetail {
  const base = mapListRow(r, created);
  return {
    ...base,
    designation: r.designation == null ? null : String(r.designation),
    preferredContactMethod:
      r.preferred_contact_method == null
        ? null
        : (String(r.preferred_contact_method) as StoryPreferredContactMethod),
    storyDescription:
      r.story_description == null ? null : String(r.story_description),
    audiences: asStringArray(r.audiences),
    preferredFormats: asStringArray(r.preferred_formats),
    targetDate: r.target_date == null ? null : String(r.target_date),
    discussionTopic:
      r.discussion_topic == null ? null : String(r.discussion_topic),
    timeline: r.timeline == null ? null : String(r.timeline),
    additionalContext:
      r.additional_context == null ? null : String(r.additional_context),
    consentCommunication: Boolean(r.consent_communication),
    consentMarketing: Boolean(r.consent_marketing),
    landingPage: r.landing_page == null ? null : String(r.landing_page),
    referrer: r.referrer == null ? null : String(r.referrer),
    utmSource: r.utm_source == null ? null : String(r.utm_source),
    utmMedium: r.utm_medium == null ? null : String(r.utm_medium),
    utmCampaign: r.utm_campaign == null ? null : String(r.utm_campaign),
    attachmentFilename:
      r.attachment_filename == null ? null : String(r.attachment_filename),
    attachmentContentType:
      r.attachment_content_type == null
        ? null
        : String(r.attachment_content_type),
    attachmentByteSize:
      r.attachment_byte_size == null ? null : Number(r.attachment_byte_size),
    lostReason: r.lost_reason == null ? null : String(r.lost_reason),
  };
}

function closedAtForStatus(status: StoryLeadStatus | undefined): string | null | undefined {
  if (status == null) return undefined;
  if (status === "won" || status === "lost" || status === "converted" || status === "declined") {
    return new Date().toISOString();
  }
  if (status === "archived") return undefined;
  return null;
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
        return mapListRow(existing[0], false);
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
        return mapListRow(rows[0]!, true);
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
          if (again[0]) return mapListRow(again[0], false);
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
      return mapDetailRow(rows[0], false);
    },

    async list(filters: StoryLeadListFilters = {}) {
      const where: string[] = ["organization_id = $1"];
      const params: unknown[] = [ORG_ID];
      let i = 2;

      const status = filters.status ?? "all";
      if (status === "open") {
        where.push(
          `status not in ('won','lost','converted','declined','archived')`,
        );
      } else if (status === "closed") {
        where.push(`status in ('won','lost','converted','declined')`);
      } else if (status !== "all") {
        where.push(`status = $${i}`);
        params.push(status);
        i += 1;
      }

      if (filters.formKey && filters.formKey !== "all") {
        where.push(`form_key = $${i}`);
        params.push(filters.formKey);
        i += 1;
      }

      if (filters.source && filters.source !== "all") {
        where.push(`source = $${i}`);
        params.push(filters.source);
        i += 1;
      }

      const qText = filters.q?.trim();
      if (qText) {
        where.push(
          `(full_name ilike $${i} or email ilike $${i} or coalesce(organisation_name,'') ilike $${i} or coalesce(phone,'') ilike $${i})`,
        );
        params.push(`%${qText}%`);
        i += 1;
      }

      const limit = Math.max(1, Math.min(filters.limit ?? 200, 500));
      params.push(limit);

      const rows = await q(
        `select * from story_leads
         where ${where.join(" and ")}
         order by submitted_at desc, created_at desc
         limit $${i}`,
        params,
      );
      return rows.map((r) => mapListRow(r, false));
    },

    async update(id: string, input: UpdateStoryLeadInput) {
      const sets: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      const assign = (col: string, value: unknown) => {
        sets.push(`${col} = $${i}`);
        params.push(value);
        i += 1;
      };

      if (input.status != null) assign("status", input.status);
      if (input.fullName != null) assign("full_name", input.fullName);
      if (input.email != null) assign("email", input.email);
      if (input.phone !== undefined) assign("phone", input.phone);
      if (input.organisationName !== undefined) {
        assign("organisation_name", input.organisationName);
      }
      if (input.designation !== undefined) assign("designation", input.designation);
      if (input.preferredContactMethod !== undefined) {
        assign("preferred_contact_method", input.preferredContactMethod);
      }
      if (input.storyDescription !== undefined) {
        assign("story_description", input.storyDescription);
      }
      if (input.occasionType !== undefined) assign("occasion_type", input.occasionType);
      if (input.audiences !== undefined) {
        assign("audiences", JSON.stringify(input.audiences));
        // Fix: jsonb cast — need ::jsonb in SQL. Rebuild with cast below.
      }
      if (input.preferredFormats !== undefined) {
        assign("preferred_formats", JSON.stringify(input.preferredFormats));
      }
      if (input.targetDate !== undefined) assign("target_date", input.targetDate);
      if (input.quantityRange !== undefined) {
        assign("quantity_range", input.quantityRange);
      }
      if (input.budgetRange !== undefined) assign("budget_range", input.budgetRange);
      if (input.primaryCity !== undefined) assign("primary_city", input.primaryCity);
      if (input.discussionTopic !== undefined) {
        assign("discussion_topic", input.discussionTopic);
      }
      if (input.timeline !== undefined) assign("timeline", input.timeline);
      if (input.additionalContext !== undefined) {
        assign("additional_context", input.additionalContext);
      }
      if (input.notes !== undefined) assign("notes", input.notes);
      if (input.lostReason !== undefined) assign("lost_reason", input.lostReason);

      const closed = closedAtForStatus(input.status);
      if (closed !== undefined) {
        assign("closed_at", closed);
      }

      if (!sets.length) {
        const existing = await this.findById(id);
        if (!existing) throw new Error("Lead not found");
        return existing;
      }

      // Cast jsonb fields properly by rewriting those set clauses.
      const rewritten = sets.map((s) => {
        if (s.startsWith("audiences =") || s.startsWith("preferred_formats =")) {
          return s.replace(/ = (\$\d+)/, " = $1::jsonb");
        }
        return s;
      });

      params.push(ORG_ID, id);
      const rows = await q(
        `update story_leads
         set ${rewritten.join(", ")}
         where organization_id = $${i} and id = $${i + 1}
         returning *`,
        params,
      );
      if (!rows[0]) throw new Error("Lead not found");
      return mapDetailRow(rows[0], false);
    },

    async setShopifyDraftOrder(id, draft) {
      const rows = await q(
        `update story_leads
         set shopify_draft_order_id = $3,
             shopify_draft_order_name = $4,
             shopify_draft_order_url = $5,
             shopify_order_error = $6
         where organization_id = $1 and id = $2
         returning *`,
        [
          ORG_ID,
          id,
          draft.draftOrderId,
          draft.draftOrderName,
          draft.draftOrderUrl,
          draft.error,
        ],
      );
      if (!rows[0]) throw new Error("Lead not found");
      return mapDetailRow(rows[0], false);
    },
  };
}
