import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import { DEFAULT_OPERATING_TIMEZONE } from "@/lib/domain/operating-week";
import type {
  ManualMetricRow,
  OperatingMetricsRepository,
  OperatingTargetsRow,
  OrdersRevenueSummary,
  RetailerWeekRowDb,
  UpsertManualMetricRowInput,
  VendorPurchaseOrderRowDb,
} from "@/lib/repositories/operating-metrics";

type Q = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

/** PO statuses that still require vendor follow-up. */
export const VENDOR_PENDING_STATUSES = ["Sent", "In Production", "Shipped", "Partial"] as const;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function isoDateOrNull(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return d.toISOString().slice(0, 10);
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function createOperatingMetricsRepository(): OperatingMetricsRepository {
  const q: Q = poolQuery;

  return {
    async getOrdersRevenueSummary(startInstantIso, endExclusiveInstantIso) {
      const rows = await q<{ local_date: string; orders: string | number; revenue: string | number }>(
        `select
           (order_date at time zone $4)::date as local_date,
           count(*)::int as orders,
           coalesce(sum(total_amount), 0)::numeric as revenue
         from external_orders
         where organization_id = $1
           and is_valid = true
           and currency = 'INR'
           and order_date >= $2::timestamptz
           and order_date < $3::timestamptz
         group by local_date
         order by local_date`,
        [ORG_ID, startInstantIso, endExclusiveInstantIso, DEFAULT_OPERATING_TIMEZONE],
      );

      const byDay = rows.map((r) => ({
        date: isoDateOrNull(r.local_date) ?? String(r.local_date),
        orders: num(r.orders),
        revenue: num(r.revenue),
      }));

      const totalOrders = byDay.reduce((sum, d) => sum + d.orders, 0);
      const totalRevenue = byDay.reduce((sum, d) => sum + d.revenue, 0);

      const summary: OrdersRevenueSummary = { totalOrders, totalRevenue, byDay };
      return summary;
    },

    async listActiveRetailers(weekStartDate, weekEndExclusiveDate) {
      const rows = await q<{
        partner_id: string;
        partner_name: string;
        partner_type: string;
        location_id: string;
        last_transfer_date: string | null;
        transferred_this_week: boolean;
      }>(
        `select
           p.id as partner_id,
           p.name as partner_name,
           p.partner_type,
           l.id as location_id,
           max(m.movement_date) as last_transfer_date,
           bool_or(m.movement_date >= $2::date and m.movement_date < $3::date) as transferred_this_week
         from partners p
         join locations l on l.partner_id = p.id and l.kind = 'Partner'
         left join stock_movements m
           on m.to_location_id = l.id
           and m.movement_type = 'Transfer'
           and m.organization_id = p.organization_id
         where p.organization_id = $1
           and p.partner_type in ('Retail Partner', 'Café')
         group by p.id, p.name, p.partner_type, l.id
         order by p.name`,
        [ORG_ID, weekStartDate, weekEndExclusiveDate],
      );

      return rows.map((r): RetailerWeekRowDb => ({
        partnerId: String(r.partner_id),
        partnerName: String(r.partner_name),
        partnerType: String(r.partner_type),
        locationId: String(r.location_id),
        lastTransferDate: isoDateOrNull(r.last_transfer_date),
        transferredThisWeek: Boolean(r.transferred_this_week),
      }));
    },

    async listVendorPurchaseOrders(startInstantIso, endExclusiveInstantIso) {
      const rows = await q<{
        id: string;
        code: string;
        vendor_id: string;
        vendor_name: string;
        product_id: string;
        product_title: string;
        status: string;
        quantity_ordered: number;
        quantity_received: number;
        ordered_date: string | null;
        required_date: string | null;
        updated_at: string | Date;
        completed_this_week: boolean;
      }>(
        `select
           po.id, po.code, po.vendor_id, v.name as vendor_name,
           po.product_id, pr.title as product_title,
           po.status, po.quantity_ordered, po.quantity_received,
           po.ordered_date, po.required_date, po.updated_at,
           (
             po.status = 'Received'
             and po.updated_at >= $2::timestamptz
             and po.updated_at < $3::timestamptz
           ) as completed_this_week
         from purchase_orders po
         join vendors v on v.id = po.vendor_id
         join products pr on pr.id = po.product_id
         where po.organization_id = $1
           and (
             po.status in ('Sent', 'In Production', 'Shipped', 'Partial')
             or (
               po.status = 'Received'
               and po.updated_at >= $2::timestamptz
               and po.updated_at < $3::timestamptz
             )
           )
         order by po.required_date nulls last, po.ordered_date nulls last, po.code`,
        [ORG_ID, startInstantIso, endExclusiveInstantIso],
      );

      return rows.map((r): VendorPurchaseOrderRowDb => ({
        purchaseOrderId: String(r.id),
        purchaseOrderCode: String(r.code),
        vendorId: String(r.vendor_id),
        vendorName: String(r.vendor_name),
        productId: String(r.product_id),
        productTitle: String(r.product_title),
        status: String(r.status),
        quantityOrdered: num(r.quantity_ordered),
        quantityReceived: num(r.quantity_received),
        orderedDate: isoDateOrNull(r.ordered_date),
        requiredDate: isoDateOrNull(r.required_date),
        updatedAt: iso(r.updated_at),
        completedThisWeek: Boolean(r.completed_this_week),
      }));
    },

    async getOperatingTargets() {
      const rows = await q<{
        organization_id: string;
        followers_per_week: number;
        views_per_week: number;
        orders_per_day: string | number;
        revenue_per_day: string | number;
        timezone: string;
        updated_at: string | Date;
      }>(
        `insert into operating_targets (organization_id)
         values ($1)
         on conflict (organization_id) do update set organization_id = excluded.organization_id
         returning organization_id, followers_per_week, views_per_week,
                   orders_per_day, revenue_per_day, timezone, updated_at`,
        [ORG_ID],
      );
      const r = rows[0]!;
      const targets: OperatingTargetsRow = {
        organizationId: String(r.organization_id),
        followersPerWeek: num(r.followers_per_week),
        viewsPerWeek: num(r.views_per_week),
        ordersPerDay: num(r.orders_per_day),
        revenuePerDay: num(r.revenue_per_day),
        timezone: String(r.timezone),
        updatedAt: iso(r.updated_at),
      };
      return targets;
    },

    async getManualMetrics(weekStartDate) {
      const rows = await q<{
        week_start: string;
        kind: string;
        value: string | number;
        notes: string;
        updated_at: string | Date;
      }>(
        `select week_start, kind, value, notes, updated_at
         from operating_manual_metrics
         where organization_id = $1 and week_start = $2::date`,
        [ORG_ID, weekStartDate],
      );
      return rows.map((r): ManualMetricRow => ({
        weekStart: isoDateOrNull(r.week_start) ?? weekStartDate,
        kind: r.kind as ManualMetricRow["kind"],
        value: num(r.value),
        notes: String(r.notes ?? ""),
        updatedAt: iso(r.updated_at),
      }));
    },

    async upsertManualMetric(input: UpsertManualMetricRowInput) {
      const rows = await q<{
        week_start: string;
        kind: string;
        value: string | number;
        notes: string;
        updated_at: string | Date;
      }>(
        `insert into operating_manual_metrics (
           organization_id, week_start, kind, value, notes, updated_at
         ) values ($1, $2::date, $3, $4, $5, now())
         on conflict (organization_id, week_start, kind) do update set
           value = excluded.value,
           notes = excluded.notes,
           updated_at = now()
         returning week_start, kind, value, notes, updated_at`,
        [ORG_ID, input.weekStart, input.kind, input.value, input.notes],
      );
      const r = rows[0]!;
      return {
        weekStart: isoDateOrNull(r.week_start) ?? input.weekStart,
        kind: r.kind as ManualMetricRow["kind"],
        value: num(r.value),
        notes: String(r.notes ?? ""),
        updatedAt: iso(r.updated_at),
      };
    },
  };
}
