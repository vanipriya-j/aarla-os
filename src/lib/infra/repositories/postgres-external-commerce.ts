import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import {
  maskEmail,
  maskPhone,
  type CommerceCustomerDiagnostic,
  type CommerceProvider,
  type ExternalCustomer,
  type ExternalFulfilment,
  type ExternalOrder,
  type ExternalOrderItem,
  type OrderExclusionReason,
} from "@/lib/domain/external-commerce-types";
import type {
  ExternalCommerceRepository,
  UpsertCustomerInput,
  UpsertFulfilmentInput,
  UpsertOrderInput,
} from "@/lib/repositories/external-commerce";

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
  return typeof value === "number" ? value : Number(value ?? 0);
}

function mapCustomer(r: Record<string, unknown>): ExternalCustomer {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    provider: r.provider as CommerceProvider,
    externalId: String(r.external_id),
    name: String(r.name ?? ""),
    phone: r.phone == null ? null : String(r.phone),
    email: r.email == null ? null : String(r.email),
    marketingConsentStatus:
      r.marketing_consent_status == null ? null : String(r.marketing_consent_status),
    latestValidOrderAt: isoOrNull(r.latest_valid_order_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    lastSyncedAt: iso(r.last_synced_at),
  };
}

function mapOrder(r: Record<string, unknown>): ExternalOrder {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    provider: r.provider as CommerceProvider,
    externalId: String(r.external_id),
    orderNumber: String(r.order_number ?? ""),
    externalCustomerId:
      r.external_customer_id == null ? null : String(r.external_customer_id),
    orderDate: iso(r.order_date),
    financialStatus: r.financial_status == null ? null : String(r.financial_status),
    fulfilmentStatus: r.fulfilment_status == null ? null : String(r.fulfilment_status),
    cancelledAt: isoOrNull(r.cancelled_at),
    isTest: Boolean(r.is_test),
    isValid: Boolean(r.is_valid),
    exclusionReason:
      r.exclusion_reason == null ? null : (String(r.exclusion_reason) as OrderExclusionReason),
    totalAmount: num(r.total_amount),
    currency: String(r.currency ?? "INR"),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    lastSyncedAt: iso(r.last_synced_at),
  };
}

function mapItem(r: Record<string, unknown>): ExternalOrderItem {
  return {
    id: String(r.id),
    externalOrderId: String(r.external_order_id),
    externalLineItemId: String(r.external_line_item_id),
    externalProductId:
      r.external_product_id == null ? null : String(r.external_product_id),
    externalVariantId:
      r.external_variant_id == null ? null : String(r.external_variant_id),
    title: String(r.title ?? ""),
    variantTitle: r.variant_title == null ? null : String(r.variant_title),
    quantity: num(r.quantity),
    unitPrice: num(r.unit_price),
  };
}

function mapFulfilment(r: Record<string, unknown>): ExternalFulfilment {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    provider: r.provider as CommerceProvider,
    externalId: String(r.external_id),
    externalOrderId: String(r.external_order_id),
    trackingCompany: r.tracking_company == null ? null : String(r.tracking_company),
    trackingNumber: r.tracking_number == null ? null : String(r.tracking_number),
    trackingUrl: r.tracking_url == null ? null : String(r.tracking_url),
    fulfilmentStatus: r.fulfilment_status == null ? null : String(r.fulfilment_status),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    lastSyncedAt: iso(r.last_synced_at),
  };
}

export function createExternalCommerceRepository(): ExternalCommerceRepository {
  const q: Q = poolQuery;

  return {
    async findCustomerByExternalId(provider, externalId) {
      const rows = await q(
        `select * from external_customers
         where organization_id = $1 and provider = $2 and external_id = $3`,
        [ORG_ID, provider, externalId],
      );
      return rows[0] ? mapCustomer(rows[0]) : null;
    },

    async upsertCustomer(input: UpsertCustomerInput) {
      const existing = await q<{ id: string; phone: string | null; name: string }>(
        `select id, phone, name from external_customers
         where organization_id = $1 and provider = $2 and external_id = $3`,
        [ORG_ID, input.provider, input.externalId],
      );
      if (existing[0]) {
        const nextPhone = input.phone?.trim() ? input.phone.trim() : existing[0].phone;
        const stubName = /^Shopify customer\b/i.test(input.name.trim());
        const nextName =
          stubName && existing[0].name?.trim() ? existing[0].name : input.name;
        await q(
          `update external_customers
           set name = $4, phone = $5, email = coalesce($6, email),
               marketing_consent_status = coalesce($7, marketing_consent_status),
               last_synced_at = now()
           where organization_id = $1 and provider = $2 and external_id = $3`,
          [
            ORG_ID,
            input.provider,
            input.externalId,
            nextName,
            nextPhone,
            input.email,
            input.marketingConsentStatus,
          ],
        );
        return { id: existing[0].id, created: false };
      }
      const rows = await q<{ id: string }>(
        `insert into external_customers (
           organization_id, provider, external_id, name, phone, email,
           marketing_consent_status, last_synced_at
         ) values ($1,$2,$3,$4,$5,$6,$7, now())
         returning id`,
        [
          ORG_ID,
          input.provider,
          input.externalId,
          input.name,
          input.phone,
          input.email,
          input.marketingConsentStatus,
        ],
      );
      return { id: rows[0]!.id, created: true };
    },

    async setLatestValidOrderAt(provider, externalId, latestValidOrderAt) {
      await q(
        `update external_customers
         set latest_valid_order_at = $4
         where organization_id = $1 and provider = $2 and external_id = $3`,
        [ORG_ID, provider, externalId, latestValidOrderAt],
      );
    },

    async upsertOrder(input: UpsertOrderInput) {
      let customerUuid: string | null = null;
      if (input.externalCustomerExternalId) {
        const cust = await q<{ id: string }>(
          `select id from external_customers
           where organization_id = $1 and provider = $2 and external_id = $3`,
          [ORG_ID, input.provider, input.externalCustomerExternalId],
        );
        customerUuid = cust[0]?.id ?? null;
      }

      const existing = await q<{ id: string }>(
        `select id from external_orders
         where organization_id = $1 and provider = $2 and external_id = $3`,
        [ORG_ID, input.provider, input.externalId],
      );

      let orderId: string;
      let created: boolean;
      if (existing[0]) {
        orderId = existing[0].id;
        created = false;
        await q(
          `update external_orders set
             order_number = $3,
             external_customer_id = $4,
             order_date = $5,
             financial_status = $6,
             fulfilment_status = $7,
             cancelled_at = $8,
             is_test = $9,
             is_valid = $10,
             exclusion_reason = $11,
             total_amount = $12,
             currency = $13,
             contact_phone = coalesce(nullif(btrim($14), ''), contact_phone),
             last_synced_at = now()
           where id = $1 and organization_id = $2`,
          [
            orderId,
            ORG_ID,
            input.orderNumber,
            customerUuid,
            input.orderDate,
            input.financialStatus,
            input.fulfilmentStatus,
            input.cancelledAt,
            input.isTest,
            input.isValid,
            input.exclusionReason,
            input.totalAmount,
            input.currency,
            input.contactPhone ?? null,
          ],
        );
      } else {
        created = true;
        const rows = await q<{ id: string }>(
          `insert into external_orders (
             organization_id, provider, external_id, order_number, external_customer_id,
             order_date, financial_status, fulfilment_status, cancelled_at,
             is_test, is_valid, exclusion_reason, total_amount, currency, contact_phone,
             last_synced_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
           returning id`,
          [
            ORG_ID,
            input.provider,
            input.externalId,
            input.orderNumber,
            customerUuid,
            input.orderDate,
            input.financialStatus,
            input.fulfilmentStatus,
            input.cancelledAt,
            input.isTest,
            input.isValid,
            input.exclusionReason,
            input.totalAmount,
            input.currency,
            input.contactPhone ?? null,
          ],
        );
        orderId = rows[0]!.id;
      }

      for (const item of input.lineItems) {
        await q(
          `insert into external_order_items (
             external_order_id, external_line_item_id, external_product_id,
             external_variant_id, title, variant_title, quantity, unit_price
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (external_order_id, external_line_item_id) do update set
             external_product_id = excluded.external_product_id,
             external_variant_id = excluded.external_variant_id,
             title = excluded.title,
             variant_title = excluded.variant_title,
             quantity = excluded.quantity,
             unit_price = excluded.unit_price`,
          [
            orderId,
            item.externalLineItemId,
            item.externalProductId,
            item.externalVariantId,
            item.title,
            item.variantTitle,
            item.quantity,
            item.unitPrice,
          ],
        );
      }

      return { id: orderId, created };
    },

    async ensureOrderContactPhoneSchema() {
      await q(`
        alter table external_orders
          add column if not exists contact_phone text
      `);
    },

    async listDeliveredOrdersMissingPhone(limit = 40) {
      const cap = Math.max(1, Math.min(Math.floor(limit), 80));
      const rows = await q<{
        order_number: string;
        customer_external_id: string;
      }>(
        `select distinct
           coalesce(nullif(btrim(o.order_number), ''), o.external_id) as order_number,
           c.external_id as customer_external_id
         from shipments s
         left join external_fulfilments f on f.id = s.external_fulfilment_id
         join external_orders o
           on o.id = coalesce(s.external_order_id, f.external_order_id)
         join external_customers c on c.id = o.external_customer_id
         where s.organization_id = $1
           and s.carrier = 'delhivery'
           and s.normalized_status = 'delivered'
           and s.delivered_at is not null
           and (c.phone is null or btrim(c.phone) = '')
           and (o.contact_phone is null or btrim(o.contact_phone) = '')
         order by order_number
         limit $2`,
        [ORG_ID, cap],
      );
      return rows.map((r) => ({
        orderNumber: String(r.order_number),
        customerExternalId: String(r.customer_external_id),
      }));
    },

    async applyContactPhone(input) {
      const phone = input.phone.trim();
      if (!phone) return { orderUpdated: false, customerUpdated: false };

      const orderRows = await q<{ id: string }>(
        `update external_orders
         set contact_phone = $4, last_synced_at = now()
         where organization_id = $1 and provider = $2 and external_id = $3
           and (contact_phone is null or btrim(contact_phone) = '')
         returning id`,
        [ORG_ID, input.provider, input.orderExternalId, phone],
      );

      let customerUpdated = false;
      if (input.customerExternalId) {
        const cust = await q<{ id: string }>(
          `update external_customers
           set phone = $4, last_synced_at = now()
           where organization_id = $1 and provider = $2 and external_id = $3
             and (phone is null or btrim(phone) = '')
           returning id`,
          [ORG_ID, input.provider, input.customerExternalId, phone],
        );
        customerUpdated = Boolean(cust[0]);
      }

      return {
        orderUpdated: Boolean(orderRows[0]),
        customerUpdated,
      };
    },

    async upsertFulfilment(input: UpsertFulfilmentInput) {
      const order = await q<{ id: string }>(
        `select id from external_orders
         where organization_id = $1 and provider = $2 and external_id = $3`,
        [ORG_ID, input.provider, input.orderExternalId],
      );
      if (!order[0]) {
        throw new Error(`Order ${input.orderExternalId} not found for fulfilment upsert`);
      }
      const existing = await q<{ id: string }>(
        `select id from external_fulfilments
         where organization_id = $1 and provider = $2 and external_id = $3`,
        [ORG_ID, input.provider, input.externalId],
      );
      if (existing[0]) {
        await q(
          `update external_fulfilments set
             external_order_id = $2,
             tracking_company = $3,
             tracking_number = $4,
             tracking_url = $5,
             fulfilment_status = $6,
             last_synced_at = now()
           where id = $1`,
          [
            existing[0].id,
            order[0].id,
            input.trackingCompany,
            input.trackingNumber,
            input.trackingUrl,
            input.fulfilmentStatus,
          ],
        );
        return { id: existing[0].id, created: false };
      }
      const rows = await q<{ id: string }>(
        `insert into external_fulfilments (
           organization_id, provider, external_id, external_order_id,
           tracking_company, tracking_number, tracking_url, fulfilment_status, last_synced_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8, now())
         returning id`,
        [
          ORG_ID,
          input.provider,
          input.externalId,
          order[0].id,
          input.trackingCompany,
          input.trackingNumber,
          input.trackingUrl,
          input.fulfilmentStatus,
        ],
      );
      return { id: rows[0]!.id, created: true };
    },

    async listCustomers() {
      const rows = await q(
        `select * from external_customers where organization_id = $1 order by name`,
        [ORG_ID],
      );
      return rows.map(mapCustomer);
    },

    async listOrdersForCustomer(customerId) {
      const rows = await q(
        `select * from external_orders
         where organization_id = $1 and external_customer_id = $2
         order by order_date desc`,
        [ORG_ID, customerId],
      );
      return rows.map(mapOrder);
    },

    async listItemsForOrder(orderId) {
      const rows = await q(
        `select * from external_order_items where external_order_id = $1 order by title`,
        [orderId],
      );
      return rows.map(mapItem);
    },

    async listFulfilmentsForOrder(orderId) {
      const rows = await q(
        `select * from external_fulfilments
         where organization_id = $1 and external_order_id = $2
         order by created_at`,
        [ORG_ID, orderId],
      );
      return rows.map(mapFulfilment);
    },

    async countOrdersByExternalId(provider, externalId) {
      const rows = await q<{ c: string }>(
        `select count(*)::text as c from external_orders
         where organization_id = $1 and provider = $2 and external_id = $3`,
        [ORG_ID, provider, externalId],
      );
      return Number(rows[0]?.c ?? 0);
    },

    async countCustomers() {
      const rows = await q<{ c: string }>(
        `select count(*)::text as c from external_customers where organization_id = $1`,
        [ORG_ID],
      );
      return Number(rows[0]?.c ?? 0);
    },

    async diagnostics(options = {}): Promise<{
      rows: CommerceCustomerDiagnostic[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }> {
      const pageSize = Math.min(Math.max(Math.floor(options.pageSize ?? 50), 1), 100);
      const page = Math.max(Math.floor(options.page ?? 1), 1);
      const offset = (page - 1) * pageSize;

      const countRows = await q<{ c: string }>(
        `select count(*)::text as c from external_customers where organization_id = $1`,
        [ORG_ID],
      );
      const total = Number(countRows[0]?.c ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, totalPages);
      const safeOffset = (safePage - 1) * pageSize;

      // Single aggregated query — avoids N+1 over every customer.
      const rows = await q<{
        external_id: string;
        name: string;
        phone: string | null;
        email: string | null;
        latest_valid_order_at: Date | string | null;
        order_count: string | number;
        last_order_number: string | null;
        last_order_date: Date | string | null;
        fulfilment_count: string | number;
        carriers: string[] | null;
        awb_available: boolean;
      }>(
        `with order_stats as (
           select
             external_customer_id,
             count(*)::int as order_count,
             (array_agg(order_number order by order_date desc nulls last))[1] as last_order_number,
             (array_agg(order_date order by order_date desc nulls last))[1] as last_order_date
           from external_orders
           where organization_id = $1
           group by external_customer_id
         ),
         ful_stats as (
           select
             o.external_customer_id,
             count(f.id)::int as fulfilment_count,
             array_remove(array_agg(distinct f.tracking_company), null) as carriers,
             bool_or(
               f.tracking_number is not null and btrim(f.tracking_number) <> ''
             ) as awb_available
           from external_fulfilments f
           join external_orders o on o.id = f.external_order_id
           where f.organization_id = $1
           group by o.external_customer_id
         )
         select
           c.external_id,
           c.name,
           c.phone,
           c.email,
           c.latest_valid_order_at,
           coalesce(os.order_count, 0) as order_count,
           os.last_order_number,
           os.last_order_date,
           coalesce(fs.fulfilment_count, 0) as fulfilment_count,
           coalesce(fs.carriers, '{}'::text[]) as carriers,
           coalesce(fs.awb_available, false) as awb_available
         from external_customers c
         left join order_stats os on os.external_customer_id = c.id
         left join ful_stats fs on fs.external_customer_id = c.id
         where c.organization_id = $1
         order by c.name
         limit $2 offset $3`,
        [ORG_ID, pageSize, total === 0 ? offset : safeOffset],
      );

      return {
        rows: rows.map((r) => ({
          externalId: String(r.external_id),
          displayName: String(r.name ?? ""),
          phoneMasked: maskPhone(r.phone),
          emailMasked: maskEmail(r.email),
          latestValidOrderAt: isoOrNull(r.latest_valid_order_at),
          orderCount: num(r.order_count),
          lastOrderNumber: r.last_order_number == null ? null : String(r.last_order_number),
          lastOrderDate: isoOrNull(r.last_order_date),
          fulfilmentCount: num(r.fulfilment_count),
          carriers: Array.isArray(r.carriers) ? r.carriers.filter(Boolean) : [],
          awbAvailable: Boolean(r.awb_available),
        })),
        total,
        page: total === 0 ? 1 : safePage,
        pageSize,
        totalPages: total === 0 ? 1 : totalPages,
      };
    },

    async countInteractionsForExternalCustomer(externalCustomerId) {
      const rows = await q<{ c: string }>(
        `select count(*)::text as c from customer_interactions
         where organization_id = $1 and external_customer_id = $2`,
        [ORG_ID, externalCustomerId],
      );
      return Number(rows[0]?.c ?? 0);
    },

    async isDoNotContact(externalCustomerId) {
      const rows = await q<{ do_not_contact: boolean }>(
        `select do_not_contact from customer_contact_preferences
         where organization_id = $1 and external_customer_id = $2`,
        [ORG_ID, externalCustomerId],
      );
      return Boolean(rows[0]?.do_not_contact);
    },
  };
}
