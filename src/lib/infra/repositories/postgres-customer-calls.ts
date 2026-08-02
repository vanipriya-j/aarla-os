import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import type {
  CallsDashboardCounts,
  CallSegmentType,
  CustomerCallQueueItem,
  CustomerCallSegment,
  CustomerContactPreference,
  CustomerInteraction,
  QueueItemStatus,
} from "@/lib/domain/customer-calls-types";
import type { CustomerCallsRepository } from "@/lib/repositories/customer-calls";
import { randomUUID } from "node:crypto";

type Q = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function dateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function mapSegment(r: Record<string, unknown>): CustomerCallSegment {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    name: String(r.name),
    description: String(r.description ?? ""),
    segmentType: r.segment_type as CallSegmentType,
    script: String(r.script),
    isActive: Boolean(r.is_active),
    cooldownDays: r.cooldown_days == null ? null : Number(r.cooldown_days),
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
  };
}

function mapQueue(r: Record<string, unknown>): CustomerCallQueueItem {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    segmentId: String(r.segment_id),
    externalCustomerId: String(r.external_customer_id),
    externalOrderId: r.external_order_id ? String(r.external_order_id) : null,
    customerName: String(r.customer_name),
    phone: String(r.phone),
    email: r.email ? String(r.email) : null,
    reason: String(r.reason ?? ""),
    lastOrderDate: dateOnly(r.last_order_date),
    deliveredAt: r.delivered_at ? new Date(String(r.delivered_at)).toISOString() : null,
    productsSummary: r.products_summary ? String(r.products_summary) : null,
    status: r.status as QueueItemStatus,
    assignedTo: r.assigned_to ? String(r.assigned_to) : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
  };
}

function mapInteraction(r: Record<string, unknown>): CustomerInteraction {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    queueItemId: String(r.queue_item_id),
    segmentId: String(r.segment_id),
    externalCustomerId: String(r.external_customer_id),
    externalOrderId: r.external_order_id ? String(r.external_order_id) : null,
    purpose: String(r.purpose),
    outcome: String(r.outcome),
    notes: r.notes ? String(r.notes) : null,
    followUpAt: dateOnly(r.follow_up_at),
    issueRaised: Boolean(r.issue_raised),
    issueType: r.issue_type ? String(r.issue_type) : null,
    requirementType: r.requirement_type ? String(r.requirement_type) : null,
    approximateQuantity:
      r.approximate_quantity == null ? null : Number(r.approximate_quantity),
    createdBy: String(r.created_by),
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

export function createCustomerCallsRepository(): CustomerCallsRepository {
  const q: Q = poolQuery;

  return {
    async listSegments() {
      const rows = await q(
        `select * from customer_call_segments
         where organization_id = $1 and is_active = true
         order by segment_type`,
        [ORG_ID],
      );
      return rows.map(mapSegment);
    },

    async getSegmentByType(type) {
      const rows = await q(
        `select * from customer_call_segments
         where organization_id = $1 and segment_type = $2`,
        [ORG_ID, type],
      );
      return rows[0] ? mapSegment(rows[0]) : null;
    },

    async listQueue(segmentId, activeOnly = true) {
      const dnc = await q<{ external_customer_id: string }>(
        `select external_customer_id from customer_contact_preferences
         where organization_id = $1 and do_not_contact = true`,
        [ORG_ID],
      );
      const blocked = dnc.map((r) => r.external_customer_id);

      const rows = await q(
        activeOnly
          ? `select * from customer_call_queue_items
             where organization_id = $1 and segment_id = $2
               and status in ('pending','in-progress','call-later')
             order by
               case status when 'in-progress' then 0 when 'pending' then 1 else 2 end,
               created_at`
          : `select * from customer_call_queue_items
             where organization_id = $1 and segment_id = $2
             order by created_at`,
        [ORG_ID, segmentId],
      );
      return rows
        .map(mapQueue)
        .filter((item) => !blocked.includes(item.externalCustomerId));
    },

    async getQueueItem(id) {
      const rows = await q(
        `select * from customer_call_queue_items where organization_id = $1 and id = $2`,
        [ORG_ID, id],
      );
      return rows[0] ? mapQueue(rows[0]) : null;
    },

    async updateQueueStatus(id, status, assignedTo) {
      const rows = await q(
        `update customer_call_queue_items
         set status = $3, assigned_to = coalesce($4, assigned_to)
         where organization_id = $1 and id = $2
         returning *`,
        [ORG_ID, id, status, assignedTo ?? null],
      );
      if (!rows[0]) throw new Error(`Queue item not found: ${id}`);
      return mapQueue(rows[0]);
    },

    async nextPending(segmentId, afterId) {
      const rows = await q(
        `select q.* from customer_call_queue_items q
         where q.organization_id = $1 and q.segment_id = $2 and q.status = 'pending'
           and not exists (
             select 1 from customer_contact_preferences p
             where p.organization_id = q.organization_id
               and p.external_customer_id = q.external_customer_id
               and p.do_not_contact = true
           )
           and ($3::uuid is null or q.id <> $3)
         order by q.created_at
         limit 1`,
        [ORG_ID, segmentId, afterId ?? null],
      );
      return rows[0] ? mapQueue(rows[0]) : null;
    },

    async skipCustomerQueues(externalCustomerId) {
      await q(
        `update customer_call_queue_items
         set status = 'skipped'
         where organization_id = $1 and external_customer_id = $2
           and status in ('pending','in-progress','call-later')`,
        [ORG_ID, externalCustomerId],
      );
    },

    async createInteraction(input) {
      const id = randomUUID();
      const notes = [input.notes, input.issueNotes].filter(Boolean).join("\n").trim() || null;
      const rows = await q(
        `insert into customer_interactions (
          id, organization_id, queue_item_id, segment_id, external_customer_id,
          external_order_id, purpose, outcome, notes, follow_up_at, issue_raised,
          issue_type, requirement_type, approximate_quantity, created_by
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        returning *`,
        [
          id,
          ORG_ID,
          input.queueItemId,
          input.segmentId,
          input.externalCustomerId,
          input.externalOrderId ?? null,
          input.purpose,
          input.outcome,
          notes,
          input.followUpAt ?? null,
          input.issueRaised,
          input.issueType ?? null,
          input.requirementType ?? null,
          input.approximateQuantity ?? null,
          input.createdBy ?? "vyshali",
        ],
      );
      return mapInteraction(rows[0]);
    },

    async listInteractionsForCustomer(externalCustomerId) {
      const rows = await q(
        `select * from customer_interactions
         where organization_id = $1 and external_customer_id = $2
         order by created_at desc`,
        [ORG_ID, externalCustomerId],
      );
      return rows.map(mapInteraction);
    },

    async listInteractionsForQueueItem(queueItemId) {
      const rows = await q(
        `select * from customer_interactions
         where organization_id = $1 and queue_item_id = $2
         order by created_at desc`,
        [ORG_ID, queueItemId],
      );
      return rows.map(mapInteraction);
    },

    async upsertDoNotContact(externalCustomerId, reason) {
      const rows = await q(
        `insert into customer_contact_preferences (
          id, organization_id, external_customer_id, do_not_contact, reason
        ) values ($1,$2,$3,true,$4)
        on conflict (organization_id, external_customer_id)
        do update set do_not_contact = true, reason = excluded.reason, updated_at = now()
        returning *`,
        [randomUUID(), ORG_ID, externalCustomerId, reason ?? null],
      );
      return {
        id: String(rows[0].id),
        organizationId: ORG_ID,
        externalCustomerId,
        doNotContact: true,
        reason: rows[0].reason ? String(rows[0].reason) : null,
        updatedAt: new Date(String(rows[0].updated_at)).toISOString(),
      } satisfies CustomerContactPreference;
    },

    async isDoNotContact(externalCustomerId) {
      const rows = await q(
        `select do_not_contact from customer_contact_preferences
         where organization_id = $1 and external_customer_id = $2`,
        [ORG_ID, externalCustomerId],
      );
      return Boolean(rows[0]?.do_not_contact);
    },

    async dashboardCounts(): Promise<CallsDashboardCounts> {
      const delivery = await q<{ n: string }>(
        `select count(*)::text as n from customer_call_queue_items q
         join customer_call_segments s on s.id = q.segment_id
         where q.organization_id = $1 and s.segment_type = 'delivery-follow-up'
           and q.status in ('pending','in-progress')
           and not exists (
             select 1 from customer_contact_preferences p
             where p.organization_id = q.organization_id
               and p.external_customer_id = q.external_customer_id
               and p.do_not_contact = true
           )`,
        [ORG_ID],
      );
      const reeng = await q<{ n: string }>(
        `select count(*)::text as n from customer_call_queue_items q
         join customer_call_segments s on s.id = q.segment_id
         where q.organization_id = $1 and s.segment_type = 're-engagement'
           and q.status in ('pending','in-progress')
           and not exists (
             select 1 from customer_contact_preferences p
             where p.organization_id = q.organization_id
               and p.external_customer_id = q.external_customer_id
               and p.do_not_contact = true
           )`,
        [ORG_ID],
      );
      const completed = await q<{ n: string }>(
        `select count(*)::text as n from customer_interactions
         where organization_id = $1 and created_at::date = current_date`,
        [ORG_ID],
      );
      const issues = await q<{ n: string }>(
        `select count(*)::text as n from customer_interactions
         where organization_id = $1 and issue_raised = true`,
        [ORG_ID],
      );
      const followUps = await q<{ n: string }>(
        `select count(*)::text as n from customer_interactions
         where organization_id = $1 and follow_up_at is not null
           and follow_up_at <= current_date`,
        [ORG_ID],
      );
      return {
        deliveryPending: Number(delivery[0]?.n ?? 0),
        reengagementPending: Number(reeng[0]?.n ?? 0),
        completedToday: Number(completed[0]?.n ?? 0),
        issuesRaised: Number(issues[0]?.n ?? 0),
        followUpsDue: Number(followUps[0]?.n ?? 0),
      };
    },
  };
}
