/**
 * Enhanced cart tracking + campaign commerce funnel types (PR 8).
 *
 * INVENTORY BOUNDARY: commerce_events / cart_sessions are demand signal only.
 * This domain must NEVER write stock_movements or channel_reservations /
 * soft reserves. Cart qty is not inventory held.
 */

export type CommerceProvider = "shopify";

/** Shopify Web Pixel standard event names we ingest. */
export type CommerceEventType =
  | "product_viewed"
  | "product_added_to_cart"
  | "product_removed_from_cart"
  | "cart_viewed"
  | "checkout_started"
  | "checkout_contact_info_submitted"
  | "checkout_address_info_submitted"
  | "checkout_shipping_info_submitted"
  | "checkout_payment_info_submitted"
  | "checkout_completed"
  | "page_viewed"
  | "collection_viewed"
  | "search_submitted";

export type CartSessionStatus =
  | "ACTIVE"
  | "CART_ABANDONED"
  | "CHECKOUT_ABANDONED"
  | "IDENTIFIED"
  | "OUTREACH_PENDING"
  | "OUTREACH_COMPLETED"
  | "RECOVERED"
  | "CONVERTED"
  | "EXPIRED";

/** Ops-facing funnel stages (aggregate buckets). */
export type CommerceFunnelStage =
  | "product_viewed"
  | "added_to_cart"
  | "cart_viewed"
  | "checkout_started"
  | "contact_submitted"
  | "purchased";

export type CartSessionIdentity = {
  customerExternalId: string | null;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  identityProvenance: string | null;
  consentState: string | null;
};

export type CartSessionUtm = {
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  campaignId: string | null;
};

export type CartSessionItemInput = {
  productExternalId: string | null;
  variantExternalId: string | null;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
  lineValue: number;
  imageUrl: string | null;
};

export type CartSession = {
  id: string;
  provider: CommerceProvider;
  anonymousSessionId: string | null;
  cartToken: string | null;
  checkoutToken: string | null;
  checkoutExternalId: string | null;
  orderExternalId: string | null;
  customerExternalId: string | null;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  status: CartSessionStatus;
  cartValue: number;
  currency: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  campaignId: string | null;
  recoveryUrl: string | null;
  outreachState: string | null;
  assignedTo: string | null;
  notes: string | null;
  firstActivityAt: string;
  lastActivityAt: string;
  abandonedAt: string | null;
  recoveredAt: string | null;
  convertedAt: string | null;
  recoveredOrderExternalId: string | null;
  recoveredRevenue: number | null;
  identityProvenance: string | null;
  consentState: string | null;
  createdAt: string;
  updatedAt: string;
  items?: CartSessionItemInput[];
};

export type CommerceEventRecord = {
  id: string;
  provider: CommerceProvider;
  eventFingerprint: string;
  eventType: string;
  occurredAt: string;
  anonymousSessionId: string | null;
  shopifyClientId: string | null;
  cartToken: string | null;
  checkoutToken: string | null;
  orderExternalId: string | null;
  customerExternalId: string | null;
  email: string | null;
  phone: string | null;
  customerName: string | null;
  productExternalId: string | null;
  variantExternalId: string | null;
  sku: string | null;
  productTitle: string | null;
  quantity: number | null;
  unitPrice: number | null;
  currency: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  campaignId: string | null;
  consentState: string | null;
  privacyState: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

/** Pixel / API ingest envelope (normalized before insert). */
export type IngestCommerceEventInput = {
  provider?: CommerceProvider;
  eventType: string;
  occurredAt?: string;
  eventFingerprint?: string;
  anonymousSessionId?: string | null;
  shopifyClientId?: string | null;
  cartToken?: string | null;
  checkoutToken?: string | null;
  orderExternalId?: string | null;
  customerExternalId?: string | null;
  email?: string | null;
  phone?: string | null;
  customerName?: string | null;
  productExternalId?: string | null;
  variantExternalId?: string | null;
  sku?: string | null;
  productTitle?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  currency?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  campaignId?: string | null;
  consentState?: string | null;
  privacyState?: string | null;
  recoveryUrl?: string | null;
  cartValue?: number | null;
  items?: CartSessionItemInput[];
  payload?: Record<string, unknown>;
};

export type CartStatusThresholds = {
  /** Minutes of inactivity before abandoned (default 30). */
  abandonAfterMinutes: number;
  /** Days of inactivity before expired (default 30). */
  expireAfterDays: number;
};

export type ResolveCartStatusInput = {
  lastActivity: Date | string;
  hasItems: boolean;
  hasIdentity: boolean;
  hasOrder: boolean;
  hasCheckoutToken: boolean;
  /** Preserve terminal / outreach states when still applicable. */
  currentStatus?: CartSessionStatus | null;
  now?: Date;
  thresholds?: Partial<CartStatusThresholds>;
};

export type CartDashboardCounts = {
  active: number;
  anonymousAbandoned: number;
  identifiedAbandoned: number;
  recovered: number;
  converted: number;
};

export type CartDashboardFilters = {
  status?: CartSessionStatus | CartSessionStatus[];
  hasPhone?: boolean;
  campaignId?: string | null;
  limit?: number;
};

export type CampaignFunnelCounts = {
  productViewed: number;
  addedToCart: number;
  cartViewed: number;
  checkoutStarted: number;
  contactSubmitted: number;
  purchased: number;
};

export type CampaignDemandByVariant = {
  variantExternalId: string | null;
  sku: string | null;
  title: string;
  activeCartUnits: number;
  checkoutUnits: number;
  identifiedAbandonedUnits: number;
  anonymousAbandonedUnits: number;
};

export type IngestCommerceEventResult = {
  ok: true;
  eventId: string;
  sessionId: string | null;
  created: boolean;
};

export function cartSessionQueueSourceKey(sessionId: string): string {
  return `cartsession:${sessionId}`;
}
