import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import {
  statusesForTab,
  type FulfilmentStatus,
  type FulfilmentTab,
} from "@/lib/domain/fulfilment-types";
import type {
  FulfilmentOrderDetail,
  FulfilmentOrderListItem,
  FulfilmentRepository,
  UpsertFulfilmentFromExternalInput,
} from "@/lib/repositories/fulfilment";

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

function num(value: unknown): number {
  return Number(value ?? 0);
}

function mapListItem(r: Record<string, unknown>): FulfilmentOrderListItem {
  return {
    id: String(r.id),
    externalOrderId: String(r.external_order_id),
    orderNumber: String(r.order_number ?? ""),
    customerName:
      r.customer_name == null || String(r.customer_name).trim() === ""
        ? null
        : String(r.customer_name),
    orderDate: iso(r.order_date),
    financialStatus: r.financial_status == null ? null : String(r.financial_status),
    shopifyFulfilmentStatus:
      r.shopify_fulfilment_status == null ? null : String(r.shopify_fulfilment_status),
    totalAmount: num(r.total_amount),
    currency: String(r.currency ?? "INR"),
    status: r.status as FulfilmentStatus,
    shippingMethod: (r.shipping_method as FulfilmentOrderListItem["shippingMethod"]) ?? null,
    awb: r.awb == null ? null : String(r.awb),
    labelStatus: r.label_status == null ? null : String(r.label_status),
    packedAt: isoOrNull(r.packed_at),
    handedOverAt: isoOrNull(r.handed_over_at),
    alternateAwaitingAwbCost: Boolean(r.alternate_awaiting_awb_cost),
    updatedAt: iso(r.updated_at),
    openTaskCount: Number(r.open_task_count ?? 0),
  };
}

export function createFulfilmentRepository(): FulfilmentRepository {
  const q: Q = poolQuery;

  async function loadLines(fulfilmentOrderId: string) {
    const rows = await q(
      `select fl.*,
              i.title,
              i.variant_title,
              i.unit_price,
              i.external_product_id,
              i.external_variant_id
       from fulfilment_lines fl
       join external_order_items i on i.id = fl.external_order_item_id
       where fl.fulfilment_order_id = $1
       order by i.title`,
      [fulfilmentOrderId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      fulfilmentOrderId: String(r.fulfilment_order_id),
      externalOrderItemId: String(r.external_order_item_id),
      title: String(r.title ?? ""),
      variantTitle: r.variant_title == null ? null : String(r.variant_title),
      requiredQuantity: Number(r.required_quantity),
      unitPrice: num(r.unit_price),
      externalProductId:
        r.external_product_id == null ? null : String(r.external_product_id),
      externalVariantId:
        r.external_variant_id == null ? null : String(r.external_variant_id),
      systemStudioQty:
        r.system_studio_qty == null ? null : Number(r.system_studio_qty),
      catalogProductCode:
        r.catalog_product_code == null ? null : String(r.catalog_product_code),
      catalogVariantCode:
        r.catalog_variant_code == null ? null : String(r.catalog_variant_code),
      physicalStatus: r.physical_status as "unchecked" | "found" | "not-found",
      physicalCheckedAt: isoOrNull(r.physical_checked_at),
      picked: Boolean(r.picked),
      pickedAt: isoOrNull(r.picked_at),
      resolution: r.resolution == null ? null : String(r.resolution),
      partnerStock: [] as FulfilmentOrderDetail["lines"][number]["partnerStock"],
    }));
  }

  async function loadTasks(fulfilmentOrderId: string) {
    const rows = await q(
      `select * from fulfilment_tasks
       where fulfilment_order_id = $1
       order by created_at desc`,
      [fulfilmentOrderId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      fulfilmentOrderId: String(r.fulfilment_order_id),
      fulfilmentLineId:
        r.fulfilment_line_id == null ? null : String(r.fulfilment_line_id),
      taskType: r.task_type as FulfilmentOrderDetail["tasks"][number]["taskType"],
      status: String(r.status),
      title: String(r.title ?? ""),
      description: String(r.description ?? ""),
      assignee: r.assignee == null ? null : String(r.assignee),
      dueAt: isoOrNull(r.due_at),
      partnerCode: r.partner_code == null ? null : String(r.partner_code),
      partnerLocationCode:
        r.partner_location_code == null ? null : String(r.partner_location_code),
      quantity: r.quantity == null ? null : Number(r.quantity),
      founderDecision:
        (r.founder_decision as FulfilmentOrderDetail["tasks"][number]["founderDecision"]) ??
        null,
      expectedAvailabilityAt:
        r.expected_availability_at == null
          ? null
          : String(r.expected_availability_at).slice(0, 10),
      customerOutcome:
        (r.customer_outcome as FulfilmentOrderDetail["tasks"][number]["customerOutcome"]) ??
        null,
      customerContactedAt: isoOrNull(r.customer_contacted_at),
      alternativeNote: r.alternative_note == null ? null : String(r.alternative_note),
      notes: r.notes == null ? null : String(r.notes),
      completedAt: isoOrNull(r.completed_at),
      createdAt: iso(r.created_at),
    }));
  }

  async function loadEvents(fulfilmentOrderId: string) {
    const rows = await q(
      `select * from fulfilment_events
       where fulfilment_order_id = $1
       order by created_at desc
       limit 100`,
      [fulfilmentOrderId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      eventType: String(r.event_type),
      summary: String(r.summary),
      detail: r.detail ?? null,
      actor: r.actor == null ? null : String(r.actor),
      createdAt: iso(r.created_at),
    }));
  }

  async function getDetail(fulfilmentOrderId: string): Promise<FulfilmentOrderDetail | null> {
    const rows = await q(
      `select fo.*,
              o.order_number,
              o.order_date,
              o.financial_status,
              o.fulfilment_status as shopify_fulfilment_status,
              o.total_amount,
              o.currency,
              o.contact_phone,
              o.shipping_city,
              o.shipping_zip,
              c.name as customer_name,
              (select count(*)::int from fulfilment_tasks t
                where t.fulfilment_order_id = fo.id
                  and t.status not in ('completed','cancelled','received')) as open_task_count
       from fulfilment_orders fo
       join external_orders o on o.id = fo.external_order_id
       left join external_customers c on c.id = o.external_customer_id
       where fo.organization_id = $1 and fo.id = $2`,
      [ORG_ID, fulfilmentOrderId],
    );
    if (!rows[0]) return null;
    const base = mapListItem(rows[0]);
    const r = rows[0];
    return {
      ...base,
      contactPhone: r.contact_phone == null ? null : String(r.contact_phone),
      shippingCity: r.shipping_city == null ? null : String(r.shipping_city),
      shippingZip: r.shipping_zip == null ? null : String(r.shipping_zip),
      packingSuggestion: r.packing_suggestion ?? null,
      packingActual: r.packing_actual ?? null,
      packingOverrideNote:
        r.packing_override_note == null ? null : String(r.packing_override_note),
      freebieProductCode:
        r.freebie_product_code == null ? null : String(r.freebie_product_code),
      freebieChoice: r.freebie_choice == null ? null : String(r.freebie_choice),
      shippingRecommendation:
        r.shipping_recommendation == null ? null : String(r.shipping_recommendation),
      shippingRecommendationReasons: r.shipping_recommendation_reasons ?? null,
      shippingOverrideReason:
        r.shipping_override_reason == null ? null : String(r.shipping_override_reason),
      courierProvider: r.courier_provider == null ? null : String(r.courier_provider),
      courierReference: r.courier_reference == null ? null : String(r.courier_reference),
      courierCost: r.courier_cost == null ? null : num(r.courier_cost),
      pickedAt: isoOrNull(r.picked_at),
      pickedBy: r.picked_by == null ? null : String(r.picked_by),
      packedBy: r.packed_by == null ? null : String(r.packed_by),
      handedOverBy: r.handed_over_by == null ? null : String(r.handed_over_by),
      customerInformedAt: isoOrNull(r.customer_informed_at),
      pickedUpAt: isoOrNull(r.picked_up_at),
      localProvider: r.local_provider == null ? null : String(r.local_provider),
      localNotes: r.local_notes == null ? null : String(r.local_notes),
      lines: await loadLines(fulfilmentOrderId),
      tasks: await loadTasks(fulfilmentOrderId),
      events: await loadEvents(fulfilmentOrderId),
    };
  }

  return {
    async listWorkbench(tab: FulfilmentTab) {
      const statuses = statusesForTab(tab);
      if (!statuses.length) return [];
      const rows = await q(
        `select fo.*,
                o.order_number,
                o.order_date,
                o.financial_status,
                o.fulfilment_status as shopify_fulfilment_status,
                o.total_amount,
                o.currency,
                c.name as customer_name,
                (select count(*)::int from fulfilment_tasks t
                  where t.fulfilment_order_id = fo.id
                    and t.status not in ('completed','cancelled','received')) as open_task_count
         from fulfilment_orders fo
         join external_orders o on o.id = fo.external_order_id
         left join external_customers c on c.id = o.external_customer_id
         where fo.organization_id = $1
           and fo.status = any($2::text[])
         order by o.order_date asc`,
        [ORG_ID, statuses],
      );
      return rows.map((r) => mapListItem(r));
    },

    getDetail,

    async listUnlinkedValidExternalOrders(limit = 50) {
      // Only orders that still need physical fulfilment — not the full Shopify history.
      const rows = await q(
        `select o.id, o.order_number, o.order_date, o.total_amount,
                o.financial_status, o.fulfilment_status, c.name as customer_name
         from external_orders o
         left join external_customers c on c.id = o.external_customer_id
         left join fulfilment_orders fo
           on fo.external_order_id = o.id and fo.organization_id = o.organization_id
         where o.organization_id = $1
           and o.is_valid = true
           and fo.id is null
           and (
             o.fulfilment_status is null
             or lower(o.fulfilment_status) in (
               'unfulfilled',
               'partial',
               'partially_fulfilled',
               'partially fulfilled',
               'in_progress',
               'in progress',
               'open',
               'scheduled',
               'on_hold',
               'on hold',
               'pending_fulfillment',
               'pending fulfilment'
             )
           )
           and not exists (
             select 1 from shipments s
             where s.external_order_id = o.id
               and s.normalized_status = 'delivered'
           )
         order by o.order_date asc
         limit $2`,
        [ORG_ID, limit],
      );
      return rows.map((r) => ({
        id: String(r.id),
        orderNumber: String(r.order_number ?? ""),
        orderDate: iso(r.order_date),
        customerName:
          r.customer_name == null || String(r.customer_name).trim() === ""
            ? null
            : String(r.customer_name),
        totalAmount: num(r.total_amount),
        financialStatus: r.financial_status == null ? null : String(r.financial_status),
        fulfilmentStatus: r.fulfilment_status == null ? null : String(r.fulfilment_status),
      }));
    },

    async archiveAlreadyShippedStockChecks() {
      const rows = await q<{ id: string; order_number: string }>(
        `select fo.id, o.order_number
         from fulfilment_orders fo
         join external_orders o on o.id = fo.external_order_id
         where fo.organization_id = $1
           and fo.status in ('received', 'stock-check')
           and (
             lower(coalesce(o.fulfilment_status, '')) in ('fulfilled', 'success')
             or exists (
               select 1 from shipments s
               where s.external_order_id = o.id
                 and s.normalized_status = 'delivered'
             )
           )`,
        [ORG_ID],
      );
      for (const row of rows) {
        await q(
          `update fulfilment_orders
           set status = 'dispatched',
               notes = coalesce(notes || E'\\n', '') || 'Auto-archived: Shopify already fulfilled / delivered before fulfil pull.',
               handed_over_at = coalesce(handed_over_at, now())
           where id = $1`,
          [row.id],
        );
        await q(
          `insert into fulfilment_events (fulfilment_order_id, event_type, summary, actor)
           values ($1, 'auto-archived', $2, 'system')`,
          [
            row.id,
            `Auto-archived #${row.order_number}: already fulfilled/delivered — not an open fulfil job.`,
          ],
        );
      }
      return rows.length;
    },

    async ensureFromExternalOrder(input: UpsertFulfilmentFromExternalInput) {
      const existing = await q<{ id: string }>(
        `select id from fulfilment_orders
         where organization_id = $1 and external_order_id = $2`,
        [ORG_ID, input.externalOrderId],
      );
      let fulfilmentId = existing[0]?.id;
      if (!fulfilmentId) {
        const created = await q<{ id: string }>(
          `insert into fulfilment_orders (organization_id, external_order_id, status)
           values ($1,$2,'stock-check')
           returning id`,
          [ORG_ID, input.externalOrderId],
        );
        fulfilmentId = created[0]!.id;
        await q(
          `insert into fulfilment_events (fulfilment_order_id, event_type, summary, actor)
           values ($1,'received','Order entered fulfilment — stock check','system')`,
          [fulfilmentId],
        );
      }

      for (const line of input.lines) {
        await q(
          `insert into fulfilment_lines (
             fulfilment_order_id, external_order_item_id, required_quantity,
             system_studio_qty, catalog_product_code, catalog_variant_code
           ) values ($1,$2,$3,$4,$5,$6)
           on conflict (fulfilment_order_id, external_order_item_id) do update set
             required_quantity = excluded.required_quantity,
             system_studio_qty = excluded.system_studio_qty,
             catalog_product_code = coalesce(excluded.catalog_product_code, fulfilment_lines.catalog_product_code),
             catalog_variant_code = coalesce(excluded.catalog_variant_code, fulfilment_lines.catalog_variant_code)`,
          [
            fulfilmentId,
            line.externalOrderItemId,
            line.requiredQuantity,
            line.systemStudioQty,
            line.catalogProductCode,
            line.catalogVariantCode,
          ],
        );
      }

      return (await getDetail(fulfilmentId))!;
    },

    async setStatus(fulfilmentOrderId, status) {
      await q(
        `update fulfilment_orders set status = $3 where organization_id = $1 and id = $2`,
        [ORG_ID, fulfilmentOrderId, status],
      );
    },

    async setPhysicalStatus(lineId, physicalStatus, actor) {
      await q(
        `update fulfilment_lines set
           physical_status = $2,
           physical_checked_at = now(),
           physical_checked_by = $3,
           resolution = case
             when $2 = 'found' then 'physical-found'
             else resolution
           end
         where id = $1`,
        [lineId, physicalStatus, actor],
      );
    },

    async setLineResolution(lineId, resolution) {
      await q(`update fulfilment_lines set resolution = $2 where id = $1`, [
        lineId,
        resolution,
      ]);
    },

    async setLinePicked(lineId, picked, actor) {
      await q(
        `update fulfilment_lines set
           picked = $2,
           picked_at = case when $2 then now() else null end
         where id = $1`,
        [lineId, picked],
      );
      void actor;
    },

    async confirmAllPicked(fulfilmentOrderId, actor) {
      await q(
        `update fulfilment_lines set picked = true, picked_at = now()
         where fulfilment_order_id = $1`,
        [fulfilmentOrderId],
      );
      await q(
        `update fulfilment_orders set
           picked_at = now(),
           picked_by = $3,
           status = 'ready-to-pack'
         where organization_id = $1 and id = $2`,
        [ORG_ID, fulfilmentOrderId, actor],
      );
    },

    async savePacking(fulfilmentOrderId, input) {
      await q(
        `update fulfilment_orders set
           packing_suggestion = $3::jsonb,
           packing_actual = $4::jsonb,
           packing_override_note = $5,
           packing_decided_at = now(),
           packing_decided_by = $6,
           packed_at = now(),
           packed_by = $6,
           status = case
             when shipping_method = 'store-pickup' then 'ready-for-pickup'
             when shipping_method is not null then 'ready-to-ship'
             else 'ready-to-ship'
           end
         where organization_id = $1 and id = $2`,
        [
          ORG_ID,
          fulfilmentOrderId,
          JSON.stringify(input.suggestion ?? null),
          JSON.stringify(input.actual ?? null),
          input.overrideNote,
          input.actor,
        ],
      );
    },

    async saveFreebie(fulfilmentOrderId, input) {
      await q(
        `update fulfilment_orders set
           freebie_choice = $3,
           freebie_product_code = $4,
           freebie_note = $5
         where organization_id = $1 and id = $2`,
        [ORG_ID, fulfilmentOrderId, input.choice, input.productCode, input.note],
      );
    },

    async saveShippingDecision(fulfilmentOrderId, input) {
      const nextStatus =
        input.method === "store-pickup" ? "ready-for-pickup" : "ready-to-ship";
      await q(
        `update fulfilment_orders set
           shipping_method = $3,
           shipping_recommendation = $4,
           shipping_recommendation_reasons = $5::jsonb,
           shipping_decision_inputs = $6::jsonb,
           shipping_override_reason = $7,
           shipping_decided_at = now(),
           shipping_decided_by = $8,
           status = case
             when status in ('ready-to-pack','ready-to-ship','ready-for-pickup','ready-for-handover')
             then $9::text
             else status
           end
         where organization_id = $1 and id = $2`,
        [
          ORG_ID,
          fulfilmentOrderId,
          input.method,
          input.recommendation,
          JSON.stringify(input.reasons ?? null),
          JSON.stringify(input.decisionInputs ?? null),
          input.overrideReason,
          input.actor,
          nextStatus,
        ],
      );
    },

    async saveCourierDetails(fulfilmentOrderId, input) {
      await q(
        `update fulfilment_orders set
           awb = coalesce($3, awb),
           courier_provider = coalesce($4, courier_provider),
           courier_reference = coalesce($5, courier_reference),
           courier_cost = coalesce($6, courier_cost),
           label_status = coalesce($7, label_status),
           alternate_awaiting_awb_cost = coalesce($8, alternate_awaiting_awb_cost),
           local_provider = coalesce($9, local_provider),
           local_notes = coalesce($10, local_notes),
           local_booking_ref = coalesce($11, local_booking_ref),
           local_delivery_cost = coalesce($12, local_delivery_cost)
         where organization_id = $1 and id = $2`,
        [
          ORG_ID,
          fulfilmentOrderId,
          input.awb ?? null,
          input.courierProvider ?? null,
          input.courierReference ?? null,
          input.courierCost ?? null,
          input.labelStatus ?? null,
          input.alternateAwaitingAwbCost ?? null,
          input.localProvider ?? null,
          input.localNotes ?? null,
          input.localBookingRef ?? null,
          input.localDeliveryCost ?? null,
        ],
      );
    },

    async markHandedOver(fulfilmentOrderId, actor) {
      await q(
        `update fulfilment_orders set
           handed_over_at = now(),
           handed_over_by = $3,
           status = 'dispatched'
         where organization_id = $1 and id = $2`,
        [ORG_ID, fulfilmentOrderId, actor],
      );
    },

    async markCustomerInformed(fulfilmentOrderId) {
      await q(
        `update fulfilment_orders set customer_informed_at = now()
         where organization_id = $1 and id = $2`,
        [ORG_ID, fulfilmentOrderId],
      );
    },

    async markPickedUp(fulfilmentOrderId) {
      await q(
        `update fulfilment_orders set
           picked_up_at = now(),
           status = 'dispatched'
         where organization_id = $1 and id = $2`,
        [ORG_ID, fulfilmentOrderId],
      );
    },

    async createTask(input) {
      const rows = await q<{ id: string }>(
        `insert into fulfilment_tasks (
           organization_id, fulfilment_order_id, fulfilment_line_id, task_type, status,
           title, description, assignee, due_at, partner_code, partner_location_code,
           quantity, created_by, notes
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         returning id`,
        [
          ORG_ID,
          input.fulfilmentOrderId,
          input.fulfilmentLineId ?? null,
          input.taskType,
          input.status ?? "open",
          input.title,
          input.description ?? "",
          input.assignee ?? null,
          input.dueAt ?? null,
          input.partnerCode ?? null,
          input.partnerLocationCode ?? null,
          input.quantity ?? null,
          input.createdBy ?? null,
          input.notes ?? null,
        ],
      );
      return rows[0]!.id;
    },

    async updateTask(taskId, patch) {
      await q(
        `update fulfilment_tasks set
           status = coalesce($2, status),
           founder_decision = coalesce($3, founder_decision),
           expected_availability_at = coalesce($4::date, expected_availability_at),
           customer_outcome = coalesce($5, customer_outcome),
           customer_contacted_at = coalesce($6::timestamptz, customer_contacted_at),
           alternative_note = coalesce($7, alternative_note),
           notes = coalesce($8, notes),
           ledger_reference = coalesce($9, ledger_reference),
           completed_at = coalesce($10::timestamptz, completed_at)
         where id = $1 and organization_id = $11`,
        [
          taskId,
          patch.status ?? null,
          patch.founderDecision ?? null,
          patch.expectedAvailabilityAt ?? null,
          patch.customerOutcome ?? null,
          patch.customerContactedAt ?? null,
          patch.alternativeNote ?? null,
          patch.notes ?? null,
          patch.ledgerReference ?? null,
          patch.completedAt ?? null,
          ORG_ID,
        ],
      );
    },

    async appendEvent(input) {
      await q(
        `insert into fulfilment_events (fulfilment_order_id, event_type, summary, detail, actor)
         values ($1,$2,$3,$4::jsonb,$5)`,
        [
          input.fulfilmentOrderId,
          input.eventType,
          input.summary,
          input.detail == null ? null : JSON.stringify(input.detail),
          input.actor ?? null,
        ],
      );
    },

    async listFreebieRules() {
      const rows = await q(
        `select name, min_order_value, max_order_value, product_code, variant_code,
                estimated_cost, priority
         from fulfilment_freebie_rules
         where organization_id = $1 and is_active = true
         order by priority asc, min_order_value desc`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        name: String(r.name),
        minOrderValue: num(r.min_order_value),
        maxOrderValue: r.max_order_value == null ? null : num(r.max_order_value),
        productCode: String(r.product_code),
        variantCode: r.variant_code == null ? null : String(r.variant_code),
        estimatedCost: r.estimated_cost == null ? null : num(r.estimated_cost),
        priority: Number(r.priority ?? 100),
      }));
    },

    async listPartnerStockBySkuHint(title: string) {
      // Best-effort: partner location balances for products whose title matches.
      const rows = await q<{
        partner_code: string;
        partner_name: string;
        location_code: string;
        qty: string;
      }>(
        `with bal as (
           select l.code as location_code,
                  l.kind,
                  p.code as partner_code,
                  p.name as partner_name,
                  pr.code as product_code,
                  pr.title as product_title,
                  sum(case
                    when m.to_location_id = l.id then m.quantity
                    when m.from_location_id = l.id then -m.quantity
                    else 0
                  end) as qty
           from locations l
           left join partners p on p.id = l.partner_id
           cross join products pr
           left join stock_movements m
             on m.organization_id = l.organization_id
            and m.product_id = pr.id
            and (m.from_location_id = l.id or m.to_location_id = l.id)
           where l.organization_id = $1
             and l.kind = 'Partner'
             and pr.organization_id = $1
             and pr.title ilike '%' || $2 || '%'
           group by l.code, l.kind, p.code, p.name, pr.code, pr.title
         )
         select partner_code, partner_name, location_code, qty::text
         from bal
         where qty > 0
         order by qty desc
         limit 20`,
        [ORG_ID, title.slice(0, 40)],
      );
      return rows
        .filter((r) => r.partner_code)
        .map((r) => ({
          partnerCode: String(r.partner_code),
          partnerName: String(r.partner_name ?? r.partner_code),
          locationCode: String(r.location_code),
          qty: Number(r.qty),
        }));
    },
  };
}
