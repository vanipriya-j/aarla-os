import type {
  CampaignDemandByVariant,
  CampaignFunnelCounts,
  CartDashboardFilters,
  CartSession,
  CartSessionItemInput,
  CartSessionStatus,
  CommerceEventRecord,
  CommerceProvider,
  IngestCommerceEventInput,
} from "@/lib/domain/commerce-cart-types";

export type InsertCommerceEventRow = {
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
};

export type UpsertCartSessionInput = {
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
  firstActivityAt: string;
  lastActivityAt: string;
  abandonedAt: string | null;
  recoveredAt: string | null;
  convertedAt: string | null;
  recoveredOrderExternalId: string | null;
  recoveredRevenue: number | null;
  identityProvenance: string | null;
  consentState: string | null;
  notes: string | null;
};

export type CartSessionListRow = CartSession & {
  itemCount: number;
};

export interface CommerceCartRepository {
  /** Insert event; ON CONFLICT DO NOTHING. Returns row + whether newly created. */
  insertEventIfNew(
    row: InsertCommerceEventRow,
  ): Promise<{ created: boolean; event: CommerceEventRecord }>;

  findSessionByCartToken(
    provider: CommerceProvider,
    cartToken: string,
  ): Promise<CartSession | null>;

  findSessionByCheckoutToken(
    provider: CommerceProvider,
    checkoutToken: string,
  ): Promise<CartSession | null>;

  findSessionByAnonymousSession(
    provider: CommerceProvider,
    anonymousSessionId: string,
  ): Promise<CartSession | null>;

  findSessionById(id: string): Promise<CartSession | null>;

  upsertCartSession(input: UpsertCartSessionInput): Promise<CartSession>;

  replaceItems(sessionId: string, items: CartSessionItemInput[]): Promise<void>;

  updateSessionStatus(
    sessionId: string,
    patch: {
      status: CartSessionStatus;
      abandonedAt?: string | null;
      recoveredAt?: string | null;
      convertedAt?: string | null;
      recoveredOrderExternalId?: string | null;
      recoveredRevenue?: number | null;
      outreachState?: string | null;
      notes?: string | null;
    },
  ): Promise<CartSession>;

  listSessions(filters: CartDashboardFilters): Promise<CartSessionListRow[]>;

  countByStatusBuckets(): Promise<{
    active: number;
    anonymousAbandoned: number;
    identifiedAbandoned: number;
    recovered: number;
    converted: number;
  }>;

  listSessionsNeedingStatusRefresh(nowIso: string): Promise<CartSession[]>;

  listEnqueueCandidates(): Promise<CartSession[]>;

  funnelAggregatesForCampaign(
    campaignId: string,
    startIso: string,
    endIso: string,
  ): Promise<CampaignFunnelCounts>;

  demandUnitsByVariant(
    campaignId: string,
  ): Promise<CampaignDemandByVariant[]>;

  getUtmCampaignMap(): Promise<Map<string, string>>;

  /** Ensure tables exist (safe if migration not yet recorded). */
  ensureSchema(): Promise<void>;
}

export type { IngestCommerceEventInput };
