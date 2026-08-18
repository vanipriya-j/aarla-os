import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import type {
  CampaignDemandByVariant,
  CartDashboardFilters,
  CartSession,
  CartSessionItemInput,
  CartSessionStatus,
  CommerceEventRecord,
  CommerceProvider,
} from "@/lib/domain/commerce-cart-types";
import { aggregateFunnelCounts, emptyFunnelCounts } from "@/lib/domain/commerce-cart";
import type {
  CartSessionListRow,
  CommerceCartRepository,
  InsertCommerceEventRow,
  UpsertCartSessionInput,
} from "@/lib/repositories/commerce-cart";

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

function num(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapEvent(r: QueryResultRow): CommerceEventRecord {
  return {
    id: String(r.id),
    provider: r.provider as CommerceProvider,
    eventFingerprint: String(r.event_fingerprint),
    eventType: String(r.event_type),
    occurredAt: iso(r.occurred_at),
    anonymousSessionId: r.anonymous_session_id ? String(r.anonymous_session_id) : null,
    shopifyClientId: r.shopify_client_id ? String(r.shopify_client_id) : null,
    cartToken: r.cart_token ? String(r.cart_token) : null,
    checkoutToken: r.checkout_token ? String(r.checkout_token) : null,
    orderExternalId: r.order_external_id ? String(r.order_external_id) : null,
    customerExternalId: r.customer_external_id ? String(r.customer_external_id) : null,
    email: r.email ? String(r.email) : null,
    phone: r.phone ? String(r.phone) : null,
    customerName: r.customer_name ? String(r.customer_name) : null,
    productExternalId: r.product_external_id ? String(r.product_external_id) : null,
    variantExternalId: r.variant_external_id ? String(r.variant_external_id) : null,
    sku: r.sku ? String(r.sku) : null,
    productTitle: r.product_title ? String(r.product_title) : null,
    quantity: r.quantity == null ? null : num(r.quantity),
    unitPrice: r.unit_price == null ? null : num(r.unit_price),
    currency: r.currency ? String(r.currency) : null,
    referrer: r.referrer ? String(r.referrer) : null,
    utmSource: r.utm_source ? String(r.utm_source) : null,
    utmMedium: r.utm_medium ? String(r.utm_medium) : null,
    utmCampaign: r.utm_campaign ? String(r.utm_campaign) : null,
    utmContent: r.utm_content ? String(r.utm_content) : null,
    utmTerm: r.utm_term ? String(r.utm_term) : null,
    campaignId: r.campaign_id ? String(r.campaign_id) : null,
    consentState: r.consent_state ? String(r.consent_state) : null,
    privacyState: r.privacy_state ? String(r.privacy_state) : null,
    payload:
      r.payload && typeof r.payload === "object"
        ? (r.payload as Record<string, unknown>)
        : {},
    createdAt: iso(r.created_at),
  };
}

function mapSession(r: QueryResultRow): CartSession {
  return {
    id: String(r.id),
    provider: r.provider as CommerceProvider,
    anonymousSessionId: r.anonymous_session_id ? String(r.anonymous_session_id) : null,
    cartToken: r.cart_token ? String(r.cart_token) : null,
    checkoutToken: r.checkout_token ? String(r.checkout_token) : null,
    checkoutExternalId: r.checkout_external_id ? String(r.checkout_external_id) : null,
    orderExternalId: r.order_external_id ? String(r.order_external_id) : null,
    customerExternalId: r.customer_external_id ? String(r.customer_external_id) : null,
    customerName: r.customer_name ? String(r.customer_name) : null,
    email: r.email ? String(r.email) : null,
    phone: r.phone ? String(r.phone) : null,
    status: r.status as CartSessionStatus,
    cartValue: num(r.cart_value),
    currency: String(r.currency ?? "INR"),
    referrer: r.referrer ? String(r.referrer) : null,
    utmSource: r.utm_source ? String(r.utm_source) : null,
    utmMedium: r.utm_medium ? String(r.utm_medium) : null,
    utmCampaign: r.utm_campaign ? String(r.utm_campaign) : null,
    utmContent: r.utm_content ? String(r.utm_content) : null,
    utmTerm: r.utm_term ? String(r.utm_term) : null,
    campaignId: r.campaign_id ? String(r.campaign_id) : null,
    recoveryUrl: r.recovery_url ? String(r.recovery_url) : null,
    outreachState: r.outreach_state ? String(r.outreach_state) : null,
    assignedTo: r.assigned_to ? String(r.assigned_to) : null,
    notes: r.notes ? String(r.notes) : null,
    firstActivityAt: iso(r.first_activity_at),
    lastActivityAt: iso(r.last_activity_at),
    abandonedAt: isoOrNull(r.abandoned_at),
    recoveredAt: isoOrNull(r.recovered_at),
    convertedAt: isoOrNull(r.converted_at),
    recoveredOrderExternalId: r.recovered_order_external_id
      ? String(r.recovered_order_external_id)
      : null,
    recoveredRevenue: r.recovered_revenue == null ? null : num(r.recovered_revenue),
    identityProvenance: r.identity_provenance ? String(r.identity_provenance) : null,
    consentState: r.consent_state ? String(r.consent_state) : null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const SESSION_COLS = `
  id, provider, anonymous_session_id, cart_token, checkout_token, checkout_external_id,
  order_external_id, customer_external_id, customer_name, email, phone, status,
  cart_value, currency, referrer, utm_source, utm_medium, utm_campaign, utm_content,
  utm_term, campaign_id, recovery_url, outreach_state, assigned_to, notes,
  first_activity_at, last_activity_at, abandoned_at, recovered_at, converted_at,
  recovered_order_external_id, recovered_revenue, identity_provenance, consent_state,
  created_at, updated_at
`;

export function createCommerceCartRepository(): CommerceCartRepository {
  const q: Q = poolQuery;

  return {
    async ensureSchema() {
      // Lightweight presence check — full DDL lives in the migration.
      await q(`select to_regclass('public.commerce_events') as t`);
      await q(`select to_regclass('public.cart_sessions') as t`);
    },

    async insertEventIfNew(row: InsertCommerceEventRow) {
      const id = randomUUID();
      const inserted = await q(
        `insert into commerce_events (
           id, organization_id, provider, event_fingerprint, event_type, occurred_at,
           anonymous_session_id, shopify_client_id, cart_token, checkout_token,
           order_external_id, customer_external_id, email, phone, customer_name,
           product_external_id, variant_external_id, sku, product_title,
           quantity, unit_price, currency, referrer,
           utm_source, utm_medium, utm_campaign, utm_content, utm_term,
           campaign_id, consent_state, privacy_state, payload
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
           $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32::jsonb
         )
         on conflict (organization_id, provider, event_fingerprint) do nothing
         returning *`,
        [
          id,
          ORG_ID,
          row.provider,
          row.eventFingerprint,
          row.eventType,
          row.occurredAt,
          row.anonymousSessionId,
          row.shopifyClientId,
          row.cartToken,
          row.checkoutToken,
          row.orderExternalId,
          row.customerExternalId,
          row.email,
          row.phone,
          row.customerName,
          row.productExternalId,
          row.variantExternalId,
          row.sku,
          row.productTitle,
          row.quantity,
          row.unitPrice,
          row.currency,
          row.referrer,
          row.utmSource,
          row.utmMedium,
          row.utmCampaign,
          row.utmContent,
          row.utmTerm,
          row.campaignId,
          row.consentState,
          row.privacyState,
          JSON.stringify(row.payload ?? {}),
        ],
      );

      if (inserted[0]) {
        return { created: true, event: mapEvent(inserted[0]) };
      }

      const existing = await q(
        `select * from commerce_events
         where organization_id = $1 and provider = $2 and event_fingerprint = $3
         limit 1`,
        [ORG_ID, row.provider, row.eventFingerprint],
      );
      return { created: false, event: mapEvent(existing[0]) };
    },

    async findSessionByCartToken(provider, cartToken) {
      const rows = await q(
        `select ${SESSION_COLS} from cart_sessions
         where organization_id = $1 and provider = $2 and cart_token = $3
         limit 1`,
        [ORG_ID, provider, cartToken],
      );
      return rows[0] ? mapSession(rows[0]) : null;
    },

    async findSessionByCheckoutToken(provider, checkoutToken) {
      const rows = await q(
        `select ${SESSION_COLS} from cart_sessions
         where organization_id = $1 and provider = $2 and checkout_token = $3
         limit 1`,
        [ORG_ID, provider, checkoutToken],
      );
      return rows[0] ? mapSession(rows[0]) : null;
    },

    async findSessionByAnonymousSession(provider, anonymousSessionId) {
      const rows = await q(
        `select ${SESSION_COLS} from cart_sessions
         where organization_id = $1 and provider = $2 and anonymous_session_id = $3
         order by last_activity_at desc
         limit 1`,
        [ORG_ID, provider, anonymousSessionId],
      );
      return rows[0] ? mapSession(rows[0]) : null;
    },

    async findSessionById(id) {
      const rows = await q(
        `select ${SESSION_COLS} from cart_sessions
         where organization_id = $1 and id = $2
         limit 1`,
        [ORG_ID, id],
      );
      return rows[0] ? mapSession(rows[0]) : null;
    },

    async upsertCartSession(input: UpsertCartSessionInput) {
      // Resolve existing by soft keys (checkout > cart > anonymous).
      let existing: CartSession | null = null;
      if (input.checkoutToken) {
        existing = await this.findSessionByCheckoutToken(input.provider, input.checkoutToken);
      }
      if (!existing && input.cartToken) {
        existing = await this.findSessionByCartToken(input.provider, input.cartToken);
      }
      if (!existing && input.anonymousSessionId && !input.cartToken && !input.checkoutToken) {
        existing = await this.findSessionByAnonymousSession(
          input.provider,
          input.anonymousSessionId,
        );
      }

      if (existing) {
        const rows = await q(
          `update cart_sessions set
             anonymous_session_id = coalesce($3, anonymous_session_id),
             cart_token = coalesce($4, cart_token),
             checkout_token = coalesce($5, checkout_token),
             checkout_external_id = coalesce($6, checkout_external_id),
             order_external_id = coalesce($7, order_external_id),
             customer_external_id = coalesce($8, customer_external_id),
             customer_name = coalesce($9, customer_name),
             email = coalesce($10, email),
             phone = coalesce($11, phone),
             status = $12,
             cart_value = $13,
             currency = coalesce(nullif($14, ''), currency),
             referrer = coalesce($15, referrer),
             utm_source = coalesce($16, utm_source),
             utm_medium = coalesce($17, utm_medium),
             utm_campaign = coalesce($18, utm_campaign),
             utm_content = coalesce($19, utm_content),
             utm_term = coalesce($20, utm_term),
             campaign_id = coalesce($21, campaign_id),
             recovery_url = coalesce($22, recovery_url),
             outreach_state = coalesce($23, outreach_state),
             last_activity_at = greatest(last_activity_at, $24::timestamptz),
             abandoned_at = $25,
             recovered_at = coalesce($26, recovered_at),
             converted_at = coalesce($27, converted_at),
             recovered_order_external_id = coalesce($28, recovered_order_external_id),
             recovered_revenue = coalesce($29, recovered_revenue),
             identity_provenance = coalesce($30, identity_provenance),
             consent_state = coalesce($31, consent_state),
             notes = coalesce($32, notes)
           where id = $1 and organization_id = $2
           returning ${SESSION_COLS}`,
          [
            existing.id,
            ORG_ID,
            input.anonymousSessionId,
            input.cartToken,
            input.checkoutToken,
            input.checkoutExternalId,
            input.orderExternalId,
            input.customerExternalId,
            input.customerName,
            input.email,
            input.phone,
            input.status,
            input.cartValue,
            input.currency,
            input.referrer,
            input.utmSource,
            input.utmMedium,
            input.utmCampaign,
            input.utmContent,
            input.utmTerm,
            input.campaignId,
            input.recoveryUrl,
            input.outreachState,
            input.lastActivityAt,
            input.abandonedAt,
            input.recoveredAt,
            input.convertedAt,
            input.recoveredOrderExternalId,
            input.recoveredRevenue,
            input.identityProvenance,
            input.consentState,
            input.notes,
          ],
        );
        return mapSession(rows[0]);
      }

      const id = randomUUID();
      const rows = await q(
        `insert into cart_sessions (
           id, organization_id, provider, anonymous_session_id, cart_token, checkout_token,
           checkout_external_id, order_external_id, customer_external_id, customer_name,
           email, phone, status, cart_value, currency, referrer,
           utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_id,
           recovery_url, outreach_state, first_activity_at, last_activity_at,
           abandoned_at, recovered_at, converted_at, recovered_order_external_id,
           recovered_revenue, identity_provenance, consent_state, notes
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
           $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
         )
         returning ${SESSION_COLS}`,
        [
          id,
          ORG_ID,
          input.provider,
          input.anonymousSessionId,
          input.cartToken,
          input.checkoutToken,
          input.checkoutExternalId,
          input.orderExternalId,
          input.customerExternalId,
          input.customerName,
          input.email,
          input.phone,
          input.status,
          input.cartValue,
          input.currency || "INR",
          input.referrer,
          input.utmSource,
          input.utmMedium,
          input.utmCampaign,
          input.utmContent,
          input.utmTerm,
          input.campaignId,
          input.recoveryUrl,
          input.outreachState,
          input.firstActivityAt,
          input.lastActivityAt,
          input.abandonedAt,
          input.recoveredAt,
          input.convertedAt,
          input.recoveredOrderExternalId,
          input.recoveredRevenue,
          input.identityProvenance,
          input.consentState,
          input.notes,
        ],
      );
      return mapSession(rows[0]);
    },

    async replaceItems(sessionId, items: CartSessionItemInput[]) {
      await q(`delete from cart_session_items where cart_session_id = $1`, [sessionId]);
      for (const item of items) {
        await q(
          `insert into cart_session_items (
             id, cart_session_id, product_external_id, variant_external_id, sku,
             title, variant_title, quantity, unit_price, line_value, image_url
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            randomUUID(),
            sessionId,
            item.productExternalId,
            item.variantExternalId,
            item.sku,
            item.title || "",
            item.variantTitle,
            Math.max(0, Math.floor(item.quantity)),
            item.unitPrice,
            item.lineValue,
            item.imageUrl,
          ],
        );
      }
    },

    async updateSessionStatus(sessionId, patch) {
      const rows = await q(
        `update cart_sessions set
           status = $3,
           abandoned_at = coalesce($4, abandoned_at),
           recovered_at = coalesce($5, recovered_at),
           converted_at = coalesce($6, converted_at),
           recovered_order_external_id = coalesce($7, recovered_order_external_id),
           recovered_revenue = coalesce($8, recovered_revenue),
           outreach_state = coalesce($9, outreach_state),
           notes = coalesce($10, notes)
         where organization_id = $1 and id = $2
         returning ${SESSION_COLS}`,
        [
          ORG_ID,
          sessionId,
          patch.status,
          patch.abandonedAt ?? null,
          patch.recoveredAt ?? null,
          patch.convertedAt ?? null,
          patch.recoveredOrderExternalId ?? null,
          patch.recoveredRevenue ?? null,
          patch.outreachState ?? null,
          patch.notes ?? null,
        ],
      );
      if (!rows[0]) throw new Error(`cart_session not found: ${sessionId}`);
      return mapSession(rows[0]);
    },

    async listSessions(filters: CartDashboardFilters): Promise<CartSessionListRow[]> {
      const statuses = filters.status
        ? Array.isArray(filters.status)
          ? filters.status
          : [filters.status]
        : null;
      const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);

      const rows = await q(
        `select s.*,
           (select count(*)::int from cart_session_items i where i.cart_session_id = s.id) as item_count
         from cart_sessions s
         where s.organization_id = $1
           and ($2::text[] is null or s.status = any($2::text[]))
           and ($3::boolean is null or (
             case when $3 then s.phone is not null and btrim(s.phone) <> ''
             else s.phone is null or btrim(s.phone) = '' end
           ))
           and ($4::uuid is null or s.campaign_id = $4)
         order by s.last_activity_at desc
         limit $5`,
        [
          ORG_ID,
          statuses,
          filters.hasPhone ?? null,
          filters.campaignId ?? null,
          limit,
        ],
      );

      return rows.map((r) => ({
        ...mapSession(r),
        itemCount: num(r.item_count),
      }));
    },

    async countByStatusBuckets() {
      const rows = await q<{
        active: string | number;
        anonymous_abandoned: string | number;
        identified_abandoned: string | number;
        recovered: string | number;
        converted: string | number;
      }>(
        `select
           count(*) filter (where status = 'ACTIVE') as active,
           count(*) filter (
             where status = 'CART_ABANDONED'
               and (phone is null or btrim(phone) = '')
               and (email is null or btrim(email) = '')
           ) as anonymous_abandoned,
           count(*) filter (
             where status in ('IDENTIFIED', 'CART_ABANDONED', 'CHECKOUT_ABANDONED', 'OUTREACH_PENDING')
               and (
                 (phone is not null and btrim(phone) <> '')
                 or (email is not null and btrim(email) <> '')
                 or (customer_external_id is not null and btrim(customer_external_id) <> '')
               )
           ) as identified_abandoned,
           count(*) filter (where status = 'RECOVERED') as recovered,
           count(*) filter (where status = 'CONVERTED') as converted
         from cart_sessions
         where organization_id = $1`,
        [ORG_ID],
      );
      const r = rows[0];
      return {
        active: num(r?.active),
        anonymousAbandoned: num(r?.anonymous_abandoned),
        identifiedAbandoned: num(r?.identified_abandoned),
        recovered: num(r?.recovered),
        converted: num(r?.converted),
      };
    },

    async listSessionsNeedingStatusRefresh(nowIso) {
      const rows = await q(
        `select ${SESSION_COLS} from cart_sessions
         where organization_id = $1
           and status not in ('CONVERTED', 'RECOVERED', 'EXPIRED')
           and last_activity_at < $2::timestamptz
         order by last_activity_at asc
         limit 500`,
        [ORG_ID, nowIso],
      );
      return rows.map(mapSession);
    },

    async listEnqueueCandidates() {
      const rows = await q(
        `select ${SESSION_COLS} from cart_sessions
         where organization_id = $1
           and status in ('IDENTIFIED', 'CART_ABANDONED', 'CHECKOUT_ABANDONED')
           and phone is not null and btrim(phone) <> ''
           and order_external_id is null
           and converted_at is null
         order by last_activity_at desc
         limit 200`,
        [ORG_ID],
      );
      return rows.map(mapSession);
    },

    async funnelAggregatesForCampaign(campaignId, startIso, endIso) {
      const rows = await q<{ event_type: string }>(
        `select event_type from commerce_events
         where organization_id = $1
           and campaign_id = $2
           and occurred_at >= $3::timestamptz
           and occurred_at <= $4::timestamptz`,
        [ORG_ID, campaignId, startIso, endIso],
      );
      if (rows.length === 0) {
        // Fallback: match via utm_campaign mapping string on events without campaign_id
        const mapped = await q<{ utm_campaign: string }>(
          `select utm_campaign from campaign_utm_mappings
           where organization_id = $1 and campaign_id = $2`,
          [ORG_ID, campaignId],
        );
        if (mapped[0]?.utm_campaign) {
          const viaUtm = await q<{ event_type: string }>(
            `select event_type from commerce_events
             where organization_id = $1
               and utm_campaign = $2
               and occurred_at >= $3::timestamptz
               and occurred_at <= $4::timestamptz`,
            [ORG_ID, mapped[0].utm_campaign, startIso, endIso],
          );
          return aggregateFunnelCounts(viaUtm.map((r) => r.event_type));
        }
        return emptyFunnelCounts();
      }
      return aggregateFunnelCounts(rows.map((r) => r.event_type));
    },

    async demandUnitsByVariant(campaignId): Promise<CampaignDemandByVariant[]> {
      const rows = await q<{
        variant_external_id: string | null;
        sku: string | null;
        title: string;
        active_cart_units: string | number;
        checkout_units: string | number;
        identified_abandoned_units: string | number;
        anonymous_abandoned_units: string | number;
      }>(
        `select
           i.variant_external_id,
           i.sku,
           coalesce(nullif(btrim(i.title), ''), 'Item') as title,
           coalesce(sum(i.quantity) filter (
             where s.status in ('ACTIVE', 'IDENTIFIED') and s.checkout_token is null
           ), 0) as active_cart_units,
           coalesce(sum(i.quantity) filter (
             where s.checkout_token is not null
               and s.status not in ('CONVERTED', 'RECOVERED', 'EXPIRED')
           ), 0) as checkout_units,
           coalesce(sum(i.quantity) filter (
             where s.status in ('IDENTIFIED', 'CART_ABANDONED', 'CHECKOUT_ABANDONED', 'OUTREACH_PENDING')
               and (
                 (s.phone is not null and btrim(s.phone) <> '')
                 or (s.email is not null and btrim(s.email) <> '')
                 or (s.customer_external_id is not null)
               )
           ), 0) as identified_abandoned_units,
           coalesce(sum(i.quantity) filter (
             where s.status in ('CART_ABANDONED', 'CHECKOUT_ABANDONED')
               and (s.phone is null or btrim(s.phone) = '')
               and (s.email is null or btrim(s.email) = '')
               and s.customer_external_id is null
           ), 0) as anonymous_abandoned_units
         from cart_session_items i
         join cart_sessions s on s.id = i.cart_session_id
         where s.organization_id = $1
           and s.campaign_id = $2
         group by i.variant_external_id, i.sku, coalesce(nullif(btrim(i.title), ''), 'Item')
         order by title`,
        [ORG_ID, campaignId],
      );

      return rows.map((r) => ({
        variantExternalId: r.variant_external_id ? String(r.variant_external_id) : null,
        sku: r.sku ? String(r.sku) : null,
        title: String(r.title),
        activeCartUnits: num(r.active_cart_units),
        checkoutUnits: num(r.checkout_units),
        identifiedAbandonedUnits: num(r.identified_abandoned_units),
        anonymousAbandonedUnits: num(r.anonymous_abandoned_units),
      }));
    },

    async getUtmCampaignMap() {
      const rows = await q<{ utm_campaign: string; campaign_id: string }>(
        `select utm_campaign, campaign_id from campaign_utm_mappings
         where organization_id = $1`,
        [ORG_ID],
      );
      const map = new Map<string, string>();
      for (const r of rows) {
        map.set(String(r.utm_campaign), String(r.campaign_id));
        map.set(String(r.utm_campaign).toLowerCase(), String(r.campaign_id));
      }
      return map;
    },
  };
}
