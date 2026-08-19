/**
 * Enhanced cart tracking service (PR 8).
 *
 * INVENTORY BOUNDARY: ingest / refresh / enqueue paths must never write
 * stock_movements or channel_reservations / soft reserves.
 */

import {
  buildEventFingerprint,
  consentAllowsOutreach,
  hasCartIdentity,
  isAbandonedStatus,
  mapUtmToCampaignId,
  readCartThresholds,
  resolveCartStatus,
  shouldMaterializeCartSession,
  stitchIdentity,
} from "@/lib/domain/commerce-cart";
import type {
  CampaignDemandByVariant,
  CampaignFunnelCounts,
  CartDashboardCounts,
  CartDashboardFilters,
  CartSession,
  CartSessionItemInput,
  CartSessionStatus,
  IngestCommerceEventInput,
  IngestCommerceEventResult,
} from "@/lib/domain/commerce-cart-types";
import { cartSessionQueueSourceKey } from "@/lib/domain/commerce-cart-types";
import { ensureTenantBasicsViaPool } from "@/lib/infra/db/ensure-tenant";
import { createCommerceCartRepository } from "@/lib/infra/repositories/postgres-commerce-cart";
import { createCustomerCallsRepository } from "@/lib/infra/repositories/postgres-customer-calls";
import type { CommerceCartRepository } from "@/lib/repositories/commerce-cart";
import type { CustomerCallsRepository } from "@/lib/repositories/customer-calls";
import type { CartSessionListRow } from "@/lib/repositories/commerce-cart";

export type CommerceCartServiceDeps = {
  repo?: CommerceCartRepository;
  callsRepo?: CustomerCallsRepository;
  now?: Date;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t ? t : null;
}

function extractItems(input: IngestCommerceEventInput): CartSessionItemInput[] {
  if (Array.isArray(input.items) && input.items.length > 0) {
    return input.items.map((it) => ({
      productExternalId: trimOrNull(it.productExternalId),
      variantExternalId: trimOrNull(it.variantExternalId),
      sku: trimOrNull(it.sku),
      title: it.title?.trim() || input.productTitle?.trim() || "Item",
      variantTitle: trimOrNull(it.variantTitle),
      quantity: Math.max(0, Math.floor(Number(it.quantity) || 0)),
      unitPrice: Number(it.unitPrice) || 0,
      lineValue:
        Number(it.lineValue) ||
        (Number(it.unitPrice) || 0) * (Math.max(0, Math.floor(Number(it.quantity) || 0))),
      imageUrl: trimOrNull(it.imageUrl),
    }));
  }

  // Single-line product events may carry product fields at the top level.
  if (
    input.productExternalId ||
    input.variantExternalId ||
    input.sku ||
    input.productTitle
  ) {
    const qty = Math.max(0, Math.floor(Number(input.quantity) || 1));
    const unit = Number(input.unitPrice) || 0;
    return [
      {
        productExternalId: trimOrNull(input.productExternalId),
        variantExternalId: trimOrNull(input.variantExternalId),
        sku: trimOrNull(input.sku),
        title: input.productTitle?.trim() || "Item",
        variantTitle: null,
        quantity: qty,
        unitPrice: unit,
        lineValue: unit * qty,
        imageUrl: null,
      },
    ];
  }

  return [];
}

/**
 * Ingest one pixel / commerce event. Idempotent on fingerprint.
 * Never touches inventory.
 */
export async function ingestCommerceEvent(
  input: IngestCommerceEventInput,
  deps: CommerceCartServiceDeps = {},
): Promise<IngestCommerceEventResult> {
  // Migrate-only /setup may have skipped org + segments — heal before FK writes.
  if (!deps.repo) {
    await ensureTenantBasicsViaPool();
  }
  const repo = deps.repo ?? createCommerceCartRepository();
  const now = deps.now ?? new Date();
  const provider = input.provider ?? "shopify";
  const eventType = String(input.eventType || "").trim();
  if (!eventType) {
    throw new Error("eventType is required");
  }

  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt).toISOString()
    : now.toISOString();

  const fingerprint = buildEventFingerprint({
    fingerprint: input.eventFingerprint,
    provider,
    eventType,
    occurredAt,
    anonymousSessionId: input.anonymousSessionId,
    shopifyClientId: input.shopifyClientId,
    cartToken: input.cartToken,
    checkoutToken: input.checkoutToken,
    orderExternalId: input.orderExternalId,
    productExternalId: input.productExternalId,
    variantExternalId: input.variantExternalId,
    quantity: input.quantity,
  });

  let campaignId = trimOrNull(input.campaignId);
  if (!campaignId && input.utmCampaign) {
    const map = await repo.getUtmCampaignMap();
    campaignId = mapUtmToCampaignId(input.utmCampaign, map);
  }

  const inserted = await repo.insertEventIfNew({
    provider,
    eventFingerprint: fingerprint,
    eventType,
    occurredAt,
    anonymousSessionId: trimOrNull(input.anonymousSessionId),
    shopifyClientId: trimOrNull(input.shopifyClientId),
    cartToken: trimOrNull(input.cartToken),
    checkoutToken: trimOrNull(input.checkoutToken),
    orderExternalId: trimOrNull(input.orderExternalId),
    customerExternalId: trimOrNull(input.customerExternalId),
    email: trimOrNull(input.email),
    phone: trimOrNull(input.phone),
    customerName: trimOrNull(input.customerName),
    productExternalId: trimOrNull(input.productExternalId),
    variantExternalId: trimOrNull(input.variantExternalId),
    sku: trimOrNull(input.sku),
    productTitle: trimOrNull(input.productTitle),
    quantity: input.quantity == null ? null : Number(input.quantity),
    unitPrice: input.unitPrice == null ? null : Number(input.unitPrice),
    currency: trimOrNull(input.currency),
    referrer: trimOrNull(input.referrer),
    utmSource: trimOrNull(input.utmSource),
    utmMedium: trimOrNull(input.utmMedium),
    utmCampaign: trimOrNull(input.utmCampaign),
    utmContent: trimOrNull(input.utmContent),
    utmTerm: trimOrNull(input.utmTerm),
    campaignId,
    consentState: trimOrNull(input.consentState),
    privacyState: trimOrNull(input.privacyState),
    payload: input.payload ?? {},
  });

  if (!shouldMaterializeCartSession(eventType)) {
    return {
      ok: true,
      eventId: inserted.event.id,
      sessionId: null,
      created: inserted.created,
    };
  }

  // Find existing session for identity stitch.
  let existing: CartSession | null = null;
  const checkoutToken = trimOrNull(input.checkoutToken);
  const cartToken = trimOrNull(input.cartToken);
  const anon = trimOrNull(input.anonymousSessionId);
  if (checkoutToken) {
    existing = await repo.findSessionByCheckoutToken(provider, checkoutToken);
  }
  if (!existing && cartToken) {
    existing = await repo.findSessionByCartToken(provider, cartToken);
  }
  if (!existing && anon) {
    existing = await repo.findSessionByAnonymousSession(provider, anon);
  }

  const identity = stitchIdentity(
    {
      customerExternalId: existing?.customerExternalId ?? null,
      customerName: existing?.customerName ?? null,
      email: existing?.email ?? null,
      phone: existing?.phone ?? null,
      identityProvenance: existing?.identityProvenance ?? null,
      consentState: existing?.consentState ?? null,
    },
    {
      customerExternalId: trimOrNull(input.customerExternalId),
      customerName: trimOrNull(input.customerName),
      email: trimOrNull(input.email),
      phone: trimOrNull(input.phone),
      identityProvenance: trimOrNull(input.customerExternalId)
        ? "shopify_customer"
        : trimOrNull(input.phone) || trimOrNull(input.email)
          ? "checkout_contact"
          : null,
      consentState: trimOrNull(input.consentState),
    },
  );

  const items = extractItems(input);
  const hasItems =
    items.some((i) => i.quantity > 0) ||
    (existing != null && (input.items === undefined ? true : items.length > 0));
  const orderId =
    trimOrNull(input.orderExternalId) ?? existing?.orderExternalId ?? null;
  const hasOrder = Boolean(orderId) || eventType === "checkout_completed";

  const thresholds = readCartThresholds();
  let status = resolveCartStatus({
    lastActivity: occurredAt,
    hasItems: hasItems || items.length > 0,
    hasIdentity: hasCartIdentity(identity),
    hasOrder,
    hasCheckoutToken: Boolean(checkoutToken ?? existing?.checkoutToken),
    currentStatus: existing?.status,
    now,
    thresholds,
  });

  if (hasOrder) {
    const wasAbandoned =
      existing &&
      (isAbandonedStatus(existing.status) ||
        existing.status === "OUTREACH_PENDING" ||
        existing.status === "OUTREACH_COMPLETED");
    status = wasAbandoned ? "RECOVERED" : "CONVERTED";
  }

  const cartValue =
    input.cartValue != null
      ? Number(input.cartValue)
      : items.reduce((s, i) => s + i.lineValue, 0) || existing?.cartValue || 0;

  const abandonedAt =
    status === "CART_ABANDONED" || status === "CHECKOUT_ABANDONED" || status === "IDENTIFIED"
      ? existing?.abandonedAt ?? occurredAt
      : existing?.abandonedAt ?? null;

  const session = await repo.upsertCartSession({
    provider,
    anonymousSessionId: anon,
    cartToken,
    checkoutToken,
    checkoutExternalId: checkoutToken,
    orderExternalId: orderId,
    customerExternalId: identity.customerExternalId,
    customerName: identity.customerName,
    email: identity.email,
    phone: identity.phone,
    status,
    cartValue,
    currency: trimOrNull(input.currency) ?? existing?.currency ?? "INR",
    referrer: trimOrNull(input.referrer) ?? existing?.referrer ?? null,
    utmSource: trimOrNull(input.utmSource) ?? existing?.utmSource ?? null,
    utmMedium: trimOrNull(input.utmMedium) ?? existing?.utmMedium ?? null,
    utmCampaign: trimOrNull(input.utmCampaign) ?? existing?.utmCampaign ?? null,
    utmContent: trimOrNull(input.utmContent) ?? existing?.utmContent ?? null,
    utmTerm: trimOrNull(input.utmTerm) ?? existing?.utmTerm ?? null,
    campaignId: campaignId ?? existing?.campaignId ?? null,
    recoveryUrl: trimOrNull(input.recoveryUrl) ?? existing?.recoveryUrl ?? null,
    outreachState: existing?.outreachState ?? null,
    firstActivityAt: existing?.firstActivityAt ?? occurredAt,
    lastActivityAt: occurredAt,
    abandonedAt,
    recoveredAt:
      status === "RECOVERED" ? existing?.recoveredAt ?? occurredAt : existing?.recoveredAt ?? null,
    convertedAt:
      status === "CONVERTED" || status === "RECOVERED"
        ? existing?.convertedAt ?? occurredAt
        : existing?.convertedAt ?? null,
    recoveredOrderExternalId:
      status === "RECOVERED" ? orderId : existing?.recoveredOrderExternalId ?? null,
    recoveredRevenue:
      status === "RECOVERED" ? cartValue : existing?.recoveredRevenue ?? null,
    identityProvenance: identity.identityProvenance,
    consentState: identity.consentState,
    notes: existing?.notes ?? null,
  });

  if (items.length > 0) {
    await repo.replaceItems(session.id, items);
  }

  return {
    ok: true,
    eventId: inserted.event.id,
    sessionId: session.id,
    created: inserted.created,
  };
}

/**
 * Mark abandoned / expired sessions from inactivity thresholds.
 * Does not touch inventory.
 */
export async function refreshCartSessionStatuses(
  now: Date = new Date(),
  deps: CommerceCartServiceDeps = {},
): Promise<{ updated: number }> {
  const repo = deps.repo ?? createCommerceCartRepository();
  const thresholds = readCartThresholds();
  // Candidates inactive for at least abandon threshold.
  const cutoff = new Date(
    now.getTime() - thresholds.abandonAfterMinutes * 60_000,
  ).toISOString();
  const sessions = await repo.listSessionsNeedingStatusRefresh(cutoff);
  let updated = 0;

  for (const s of sessions) {
    const next = resolveCartStatus({
      lastActivity: s.lastActivityAt,
      hasItems: true,
      hasIdentity: hasCartIdentity(s),
      hasOrder: Boolean(s.orderExternalId),
      hasCheckoutToken: Boolean(s.checkoutToken),
      currentStatus: s.status,
      now,
      thresholds,
    });
    if (next === s.status) continue;
    await repo.updateSessionStatus(s.id, {
      status: next,
      abandonedAt:
        next === "CART_ABANDONED" ||
        next === "CHECKOUT_ABANDONED" ||
        next === "IDENTIFIED"
          ? s.abandonedAt ?? now.toISOString()
          : undefined,
    });
    updated += 1;
  }

  return { updated };
}

export async function listCartDashboard(
  filters: CartDashboardFilters = {},
  deps: CommerceCartServiceDeps = {},
): Promise<{ counts: CartDashboardCounts; sessions: CartSessionListRow[] }> {
  const repo = deps.repo ?? createCommerceCartRepository();
  const [counts, sessions] = await Promise.all([
    repo.countByStatusBuckets(),
    repo.listSessions(filters),
  ]);
  return { counts, sessions };
}

export async function markCartSessionRecovered(
  sessionId: string,
  opts: { orderExternalId?: string | null; revenue?: number | null; notes?: string | null } = {},
  deps: CommerceCartServiceDeps = {},
): Promise<CartSession> {
  const repo = deps.repo ?? createCommerceCartRepository();
  const now = deps.now ?? new Date();
  return repo.updateSessionStatus(sessionId, {
    status: "RECOVERED",
    recoveredAt: now.toISOString(),
    convertedAt: now.toISOString(),
    recoveredOrderExternalId: opts.orderExternalId ?? null,
    recoveredRevenue: opts.revenue ?? null,
    notes: opts.notes ?? null,
  });
}

export type EnqueueIdentifiedSummary = {
  candidates: number;
  created: number;
  updated: number;
  skippedAnonymous: number;
  skippedConsent: number;
  skippedDnc: number;
};

/**
 * Bridge to #32 abandoned-cart segment: upsert queue rows for identified
 * abandoned cart sessions with phone + consent. Does NOT auto-send messages.
 * source_key = cartsession:{sessionId}
 */
export async function enqueueIdentifiedAbandonedCarts(
  deps: CommerceCartServiceDeps = {},
): Promise<EnqueueIdentifiedSummary> {
  const repo = deps.repo ?? createCommerceCartRepository();
  const calls = deps.callsRepo ?? createCustomerCallsRepository();
  const now = deps.now ?? new Date();

  await calls.ensureQueueSchema();
  await calls.ensureAbandonedCartSchema();

  const summary: EnqueueIdentifiedSummary = {
    candidates: 0,
    created: 0,
    updated: 0,
    skippedAnonymous: 0,
    skippedConsent: 0,
    skippedDnc: 0,
  };

  const segment = await calls.getSegmentByType("abandoned-cart");
  if (!segment) {
    throw new Error(
      "abandoned-cart segment missing — run migrations/seed so Customer Calls segments exist.",
    );
  }

  const candidates = await repo.listEnqueueCandidates();
  summary.candidates = candidates.length;

  for (const session of candidates) {
    const phone = trimOrNull(session.phone);
    if (!phone) {
      summary.skippedAnonymous += 1;
      continue;
    }
    if (!consentAllowsOutreach(session.consentState)) {
      summary.skippedConsent += 1;
      continue;
    }

    const externalCustomerId =
      trimOrNull(session.customerExternalId) ?? `cartsession:${session.id}`;

    if (await calls.isDoNotContact(externalCustomerId)) {
      summary.skippedDnc += 1;
      continue;
    }

    const sourceKey = cartSessionQueueSourceKey(session.id);
    const minutesAgo = Math.max(
      0,
      Math.round(
        (now.getTime() - new Date(session.lastActivityAt).getTime()) / 60_000,
      ),
    );
    const result = await calls.upsertQueueCandidate({
      segmentId: segment.id,
      sourceKey,
      externalCustomerId,
      externalOrderId: null,
      customerName: session.customerName?.trim() || "Customer",
      phone,
      email: session.email,
      reason: `Live cart abandoned · ${minutesAgo}m inactive · ${session.status}`,
      lastOrderDate: session.lastActivityAt.slice(0, 10),
      deliveredAt: null,
      productsSummary: null,
      checkoutUrl: session.recoveryUrl,
      cartSubtotal: session.cartValue,
      cartCurrency: session.currency,
    });

    if (result.created) summary.created += 1;
    else summary.updated += 1;

    if (session.status !== "OUTREACH_PENDING") {
      await repo.updateSessionStatus(session.id, {
        status: "OUTREACH_PENDING",
        outreachState: "queued",
      });
    }
  }

  return summary;
}

export async function getCampaignFunnel(
  campaignId: string,
  startIso: string,
  endIso: string,
  deps: CommerceCartServiceDeps = {},
): Promise<{
  funnel: CampaignFunnelCounts;
  demand: CampaignDemandByVariant[];
}> {
  const repo = deps.repo ?? createCommerceCartRepository();
  const [funnel, demand] = await Promise.all([
    repo.funnelAggregatesForCampaign(campaignId, startIso, endIso),
    repo.demandUnitsByVariant(campaignId),
  ]);
  return { funnel, demand };
}

export type { CartSessionStatus };
