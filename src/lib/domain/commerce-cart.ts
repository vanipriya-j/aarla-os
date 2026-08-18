/**
 * Pure helpers for enhanced cart tracking (PR 8).
 *
 * INVENTORY BOUNDARY (asserted in comments — no inventory side effects here):
 * - Do NOT write stock_movements
 * - Do NOT create / update channel_reservations or soft reserves
 * - Cart session quantities are demand signal for campaign funnel / outreach only
 */

import { createHash } from "node:crypto";
import type {
  CampaignFunnelCounts,
  CartSessionIdentity,
  CartSessionStatus,
  CartStatusThresholds,
  CommerceEventType,
  CommerceFunnelStage,
  ResolveCartStatusInput,
} from "@/lib/domain/commerce-cart-types";

export const DEFAULT_CART_THRESHOLDS: CartStatusThresholds = {
  abandonAfterMinutes: 30,
  expireAfterDays: 30,
};

/** Event types that should upsert a cart_sessions row (+ optional items). */
const MATERIALIZE_EVENT_TYPES = new Set<string>([
  "product_added_to_cart",
  "product_removed_from_cart",
  "cart_viewed",
  "checkout_started",
  "checkout_contact_info_submitted",
  "checkout_address_info_submitted",
  "checkout_shipping_info_submitted",
  "checkout_payment_info_submitted",
  "checkout_completed",
]);

const FUNNEL_STAGE_BY_EVENT: Partial<Record<string, CommerceFunnelStage>> = {
  product_viewed: "product_viewed",
  product_added_to_cart: "added_to_cart",
  cart_viewed: "cart_viewed",
  checkout_started: "checkout_started",
  checkout_contact_info_submitted: "contact_submitted",
  checkout_address_info_submitted: "contact_submitted",
  checkout_completed: "purchased",
};

export function readCartThresholds(
  env: NodeJS.ProcessEnv = process.env,
): CartStatusThresholds {
  const abandonRaw = env.CART_ABANDON_AFTER_MINUTES?.trim();
  const expireRaw = env.CART_EXPIRE_AFTER_DAYS?.trim();
  const abandon = abandonRaw ? Number(abandonRaw) : DEFAULT_CART_THRESHOLDS.abandonAfterMinutes;
  const expire = expireRaw ? Number(expireRaw) : DEFAULT_CART_THRESHOLDS.expireAfterDays;
  return {
    abandonAfterMinutes:
      Number.isFinite(abandon) && abandon > 0
        ? abandon
        : DEFAULT_CART_THRESHOLDS.abandonAfterMinutes,
    expireAfterDays:
      Number.isFinite(expire) && expire > 0
        ? expire
        : DEFAULT_CART_THRESHOLDS.expireAfterDays,
  };
}

/**
 * Stable fingerprint for idempotent event insert.
 * Prefer a client-provided fingerprint when present; otherwise hash parts.
 */
export function buildEventFingerprint(parts: {
  fingerprint?: string | null;
  provider?: string;
  eventType: string;
  occurredAt: string;
  anonymousSessionId?: string | null;
  shopifyClientId?: string | null;
  cartToken?: string | null;
  checkoutToken?: string | null;
  orderExternalId?: string | null;
  productExternalId?: string | null;
  variantExternalId?: string | null;
  quantity?: number | null;
}): string {
  const provided = parts.fingerprint?.trim();
  if (provided) return provided;

  const raw = [
    parts.provider ?? "shopify",
    parts.eventType,
    parts.occurredAt,
    parts.anonymousSessionId ?? "",
    parts.shopifyClientId ?? "",
    parts.cartToken ?? "",
    parts.checkoutToken ?? "",
    parts.orderExternalId ?? "",
    parts.productExternalId ?? "",
    parts.variantExternalId ?? "",
    parts.quantity == null ? "" : String(parts.quantity),
  ].join("|");

  return createHash("sha256").update(raw).digest("hex");
}

export function shouldMaterializeCartSession(eventType: string): boolean {
  return MATERIALIZE_EVENT_TYPES.has(eventType.trim());
}

function nonEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t ? t : null;
}

/**
 * Merge identity fields — never overwrite a known value with empty/null.
 */
export function stitchIdentity(
  existing: Partial<CartSessionIdentity>,
  incoming: Partial<CartSessionIdentity>,
): CartSessionIdentity {
  const pick = (
    key: keyof CartSessionIdentity,
  ): string | null => {
    const next = nonEmpty(incoming[key] ?? null);
    if (next) return next;
    return nonEmpty(existing[key] ?? null);
  };

  const customerExternalId = pick("customerExternalId");
  const customerName = pick("customerName");
  const email = pick("email");
  const phone = pick("phone");
  const consentState = pick("consentState");

  let identityProvenance = nonEmpty(existing.identityProvenance);
  if (!identityProvenance && (customerExternalId || email || phone || customerName)) {
    identityProvenance = nonEmpty(incoming.identityProvenance) ?? "event";
  } else if (incoming.identityProvenance && !existing.identityProvenance) {
    identityProvenance = nonEmpty(incoming.identityProvenance);
  } else if (
    incoming.identityProvenance &&
    (incoming.phone || incoming.email || incoming.customerExternalId) &&
    (!existing.phone || !existing.email)
  ) {
    // Prefer richer provenance when we newly learned contact fields.
    identityProvenance =
      nonEmpty(incoming.identityProvenance) ?? identityProvenance;
  }

  return {
    customerExternalId,
    customerName,
    email,
    phone,
    identityProvenance,
    consentState,
  };
}

export function hasCartIdentity(identity: Partial<CartSessionIdentity>): boolean {
  return Boolean(
    nonEmpty(identity.phone) ||
      nonEmpty(identity.email) ||
      nonEmpty(identity.customerExternalId),
  );
}

/**
 * Resolve session status from activity / identity / order signals.
 * Preserves OUTREACH_* and RECOVERED when still appropriate.
 */
export function resolveCartStatus(input: ResolveCartStatusInput): CartSessionStatus {
  const thresholds: CartStatusThresholds = {
    ...DEFAULT_CART_THRESHOLDS,
    ...input.thresholds,
  };
  const now = input.now ?? new Date();
  const last =
    input.lastActivity instanceof Date
      ? input.lastActivity
      : new Date(input.lastActivity);
  const lastMs = last.getTime();
  const nowMs = now.getTime();
  const inactiveMs = Math.max(0, nowMs - lastMs);
  const abandonMs = thresholds.abandonAfterMinutes * 60_000;
  const expireMs = thresholds.expireAfterDays * 86_400_000;

  const current = input.currentStatus ?? null;

  if (input.hasOrder) {
    if (current === "RECOVERED" || current === "OUTREACH_COMPLETED" || current === "OUTREACH_PENDING") {
      return "RECOVERED";
    }
    return "CONVERTED";
  }

  if (current === "RECOVERED") return "RECOVERED";

  if (inactiveMs >= expireMs) return "EXPIRED";

  if (inactiveMs >= abandonMs && input.hasItems) {
    if (input.hasCheckoutToken) return "CHECKOUT_ABANDONED";
    if (input.hasIdentity) return "IDENTIFIED";
    return "CART_ABANDONED";
  }

  if (current === "OUTREACH_PENDING" || current === "OUTREACH_COMPLETED") {
    return current;
  }

  if (input.hasIdentity) return "IDENTIFIED";
  return "ACTIVE";
}

export function mapUtmToCampaignId(
  utmCampaign: string | null | undefined,
  mappings: Map<string, string> | Record<string, string>,
): string | null {
  const key = nonEmpty(utmCampaign);
  if (!key) return null;
  if (mappings instanceof Map) return mappings.get(key) ?? mappings.get(key.toLowerCase()) ?? null;
  return mappings[key] ?? mappings[key.toLowerCase()] ?? null;
}

export function funnelStageForEvent(eventType: string): CommerceFunnelStage | null {
  return FUNNEL_STAGE_BY_EVENT[eventType.trim()] ?? null;
}

export function emptyFunnelCounts(): CampaignFunnelCounts {
  return {
    productViewed: 0,
    addedToCart: 0,
    cartViewed: 0,
    checkoutStarted: 0,
    contactSubmitted: 0,
    purchased: 0,
  };
}

/** Aggregate event rows into funnel stage counts (pure). */
export function aggregateFunnelCounts(
  eventTypes: string[],
): CampaignFunnelCounts {
  const counts = emptyFunnelCounts();
  for (const t of eventTypes) {
    const stage = funnelStageForEvent(t);
    if (!stage) continue;
    switch (stage) {
      case "product_viewed":
        counts.productViewed += 1;
        break;
      case "added_to_cart":
        counts.addedToCart += 1;
        break;
      case "cart_viewed":
        counts.cartViewed += 1;
        break;
      case "checkout_started":
        counts.checkoutStarted += 1;
        break;
      case "contact_submitted":
        counts.contactSubmitted += 1;
        break;
      case "purchased":
        counts.purchased += 1;
        break;
    }
  }
  return counts;
}

export function isKnownCommerceEventType(value: string): value is CommerceEventType {
  return [
    "product_viewed",
    "product_added_to_cart",
    "product_removed_from_cart",
    "cart_viewed",
    "checkout_started",
    "checkout_contact_info_submitted",
    "checkout_address_info_submitted",
    "checkout_shipping_info_submitted",
    "checkout_payment_info_submitted",
    "checkout_completed",
    "page_viewed",
    "collection_viewed",
    "search_submitted",
  ].includes(value);
}

/** Consent ok for outreach enqueue — deny explicit opt-out / DNC-like states. */
export function consentAllowsOutreach(consentState: string | null | undefined): boolean {
  if (!consentState) return true;
  const c = consentState.trim().toLowerCase();
  if (!c) return true;
  if (
    c.includes("denied") ||
    c.includes("opt_out") ||
    c.includes("opt-out") ||
    c.includes("dnc") ||
    c === "no" ||
    c === "false"
  ) {
    return false;
  }
  return true;
}

export function isAbandonedStatus(status: CartSessionStatus): boolean {
  return (
    status === "CART_ABANDONED" ||
    status === "CHECKOUT_ABANDONED" ||
    status === "IDENTIFIED"
  );
}
