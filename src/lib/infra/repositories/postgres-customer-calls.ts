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

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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

    async ensureQueueSchema() {
      await q(`
        alter table customer_call_queue_items
          add column if not exists source_key text
      `);
      await q(`
        update customer_call_queue_items
        set source_key = case
          when source_key is null or btrim(source_key) = '' then 'legacy:' || id::text
          else source_key
        end
        where source_key is null or btrim(source_key) = ''
      `);
      await q(`
        alter table customer_call_queue_items
          alter column source_key set not null
      `);
      await q(`
        create unique index if not exists customer_call_queue_source_key_uidx
          on customer_call_queue_items (organization_id, segment_id, source_key)
      `);
    },

    async hasSyncedCommerce() {
      const rows = await q<{ n: string }>(
        `select (
           (select count(*) from external_customers where organization_id = $1) +
           (select count(*) from external_orders where organization_id = $1) +
           (select count(*) from shipments where organization_id = $1)
         )::text as n`,
        [ORG_ID],
      );
      return Number(rows[0]?.n ?? 0) > 0;
    },

    async countShipments() {
      const rows = await q<{ n: string }>(
        `select count(*)::text as n from shipments where organization_id = $1`,
        [ORG_ID],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async listDeliveryFollowUpCandidates(lookbackDays) {
      const days = Math.max(1, Math.floor(lookbackDays));
      const rows = await q<{
        external_customer_id: string;
        customer_name: string;
        phone: string | null;
        email: string | null;
        order_number: string;
        order_date: Date | string | null;
        delivered_at: Date | string;
        products_summary: string | null;
      }>(
        `select
           c.external_id as external_customer_id,
           coalesce(nullif(btrim(c.name), ''), 'Customer') as customer_name,
           nullif(btrim(c.phone), '') as phone,
           c.email,
           coalesce(nullif(btrim(o.order_number), ''), o.external_id) as order_number,
           o.order_date,
           s.delivered_at,
           (
             select string_agg(
               trim(both from i.title) || ' ×' || i.quantity::text,
               ', '
               order by i.title
             )
             from external_order_items i
             where i.external_order_id = o.id
           ) as products_summary
         from shipments s
         left join external_fulfilments f on f.id = s.external_fulfilment_id
         join external_orders o
           on o.id = coalesce(s.external_order_id, f.external_order_id)
         join external_customers c on c.id = o.external_customer_id
         where s.organization_id = $1
           and s.carrier = 'delhivery'
           and s.normalized_status = 'delivered'
           and s.delivered_at is not null
           and s.delivered_at >= (now() - make_interval(days => $2))
           and o.is_valid = true
           and not exists (
             select 1 from customer_contact_preferences p
             where p.organization_id = c.organization_id
               and p.external_customer_id = c.external_id
               and p.do_not_contact = true
           )
         order by s.delivered_at desc, o.order_number`,
        [ORG_ID, days],
      );

      return rows.map((r) => ({
        externalCustomerId: String(r.external_customer_id),
        customerName: String(r.customer_name),
        phone: r.phone ? String(r.phone) : "Phone missing",
        email: r.email ? String(r.email) : null,
        orderNumber: String(r.order_number),
        orderDate: dateOnly(r.order_date),
        deliveredAt: isoOrNull(r.delivered_at)!,
        productsSummary: r.products_summary ? String(r.products_summary) : null,
      }));
    },

    async listReengagementCandidates(lapseDays) {
      const days = Math.max(1, Math.floor(lapseDays));
      const rows = await q<{
        external_customer_id: string;
        customer_name: string;
        phone: string;
        email: string | null;
        last_order_number: string | null;
        last_order_date: Date | string | null;
        products_summary: string | null;
      }>(
        `with last_valid as (
           select distinct on (o.external_customer_id)
             o.external_customer_id as customer_uuid,
             o.id as order_uuid,
             coalesce(nullif(btrim(o.order_number), ''), o.external_id) as order_number,
             o.order_date
           from external_orders o
           where o.organization_id = $1
             and o.is_valid = true
             and o.external_customer_id is not null
           order by o.external_customer_id, o.order_date desc nulls last
         )
         select
           c.external_id as external_customer_id,
           coalesce(nullif(btrim(c.name), ''), 'Customer') as customer_name,
           btrim(c.phone) as phone,
           c.email,
           lv.order_number as last_order_number,
           lv.order_date as last_order_date,
           (
             select string_agg(
               trim(both from i.title) || ' ×' || i.quantity::text,
               ', '
               order by i.title
             )
             from external_order_items i
             where i.external_order_id = lv.order_uuid
           ) as products_summary
         from external_customers c
         join last_valid lv on lv.customer_uuid = c.id
         where c.organization_id = $1
           and c.phone is not null
           and btrim(c.phone) <> ''
           and c.latest_valid_order_at is not null
           and c.latest_valid_order_at < (now() - make_interval(days => $2))
           and not exists (
             select 1 from customer_contact_preferences p
             where p.organization_id = c.organization_id
               and p.external_customer_id = c.external_id
               and p.do_not_contact = true
           )
         order by c.latest_valid_order_at asc, c.name`,
        [ORG_ID, days],
      );

      return rows.map((r) => ({
        externalCustomerId: String(r.external_customer_id),
        customerName: String(r.customer_name),
        phone: String(r.phone),
        email: r.email ? String(r.email) : null,
        lastOrderNumber: r.last_order_number ? String(r.last_order_number) : null,
        lastOrderDate: dateOnly(r.last_order_date),
        productsSummary: r.products_summary ? String(r.products_summary) : null,
      }));
    },

    async upsertQueueCandidate(input) {
      const id = randomUUID();
      const rows = await q(
        `insert into customer_call_queue_items (
           id, organization_id, segment_id, source_key, external_customer_id, external_order_id,
           customer_name, phone, email, reason, last_order_date, delivered_at,
           products_summary, status
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending'
         )
         on conflict (organization_id, segment_id, source_key)
         do update set
           external_customer_id = excluded.external_customer_id,
           external_order_id = excluded.external_order_id,
           customer_name = excluded.customer_name,
           phone = excluded.phone,
           email = excluded.email,
           reason = case
             when customer_call_queue_items.status in ('pending', 'call-later')
               then excluded.reason
             else customer_call_queue_items.reason
           end,
           last_order_date = excluded.last_order_date,
           delivered_at = excluded.delivered_at,
           products_summary = excluded.products_summary,
           updated_at = now()
         returning *, (xmax = 0) as inserted`,
        [
          id,
          ORG_ID,
          input.segmentId,
          input.sourceKey,
          input.externalCustomerId,
          input.externalOrderId,
          input.customerName,
          input.phone,
          input.email,
          input.reason,
          input.lastOrderDate,
          input.deliveredAt,
          input.productsSummary,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Failed to upsert queue candidate");
      return {
        created: Boolean(row.inserted),
        item: mapQueue(row),
      };
    },

    async retireStalePending(segmentId, keepSourceKeys) {
      if (keepSourceKeys.length === 0) return 0;

      const rows = await q<{ id: string }>(
        `delete from customer_call_queue_items q
         where q.organization_id = $1
           and q.segment_id = $2
           and q.status = 'pending'
           and not exists (
             select 1 from customer_interactions i where i.queue_item_id = q.id
           )
           and not (q.source_key = any($3::text[]))
         returning q.id`,
        [ORG_ID, segmentId, keepSourceKeys],
      );
      return rows.length;
    },

    async clearDemoPending(segmentId) {
      const rows = await q<{ id: string }>(
        `delete from customer_call_queue_items q
         where q.organization_id = $1
           and q.segment_id = $2
           and q.status = 'pending'
           and (
             q.source_key like 'seed:%'
             or q.source_key like 'legacy:%'
             or q.external_customer_id like 'cust-%'
           )
           and not exists (
             select 1 from customer_interactions i where i.queue_item_id = q.id
           )
         returning q.id`,
        [ORG_ID, segmentId],
      );
      return rows.length;
    },
  };
}
