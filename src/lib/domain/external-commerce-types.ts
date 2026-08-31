export const COMMERCE_PROVIDERS = ["shopify"] as const;
export type CommerceProvider = (typeof COMMERCE_PROVIDERS)[number];

export const ORDER_EXCLUSION_REASONS = [
  "cancelled",
  "test",
  "fully_refunded",
  "no_customer",
] as const;
export type OrderExclusionReason = (typeof ORDER_EXCLUSION_REASONS)[number];

export interface ExternalCustomer {
  id: string;
  organizationId: string;
  provider: CommerceProvider;
  externalId: string;
  name: string;
  phone: string | null;
  email: string | null;
  marketingConsentStatus: string | null;
  latestValidOrderAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
}

export interface ExternalOrder {
  id: string;
  organizationId: string;
  provider: CommerceProvider;
  externalId: string;
  orderNumber: string;
  externalCustomerId: string | null;
  orderDate: string;
  financialStatus: string | null;
  fulfilmentStatus: string | null;
  cancelledAt: string | null;
  isTest: boolean;
  isValid: boolean;
  exclusionReason: OrderExclusionReason | null;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
}

export interface ExternalOrderItem {
  id: string;
  externalOrderId: string;
  externalLineItemId: string;
  externalProductId: string | null;
  externalVariantId: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
}

export interface ExternalFulfilment {
  id: string;
  organizationId: string;
  provider: CommerceProvider;
  externalId: string;
  externalOrderId: string;
  trackingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  fulfilmentStatus: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
}

export interface ShopifySyncSummary {
  customersRead: number;
  customersAdded: number;
  customersUpdated: number;
  ordersRead: number;
  ordersAdded: number;
  ordersUpdated: number;
  fulfilmentsFound: number;
  awbsFound: number;
  recordsSkipped: number;
  errors: string[];
  /** Chunked sync: more Shopify pages remain */
  hasMore?: boolean;
  /** Pass back into the next sync call */
  nextCursor?: string | null;
  pagesFetched?: number;
  /** True when this call finished the full catalog (no more pages) */
  complete?: boolean;
  /** incremental = only orders after watermark; full = entire catalog */
  mode?: "incremental" | "full";
  /** Watermark used for this run (ISO), if incremental */
  incrementalFrom?: string | null;
  /**
   * Shopify ordersCount for this run’s filter (full catalog or incremental window).
   * Used by the UI as “Loaded X of Y orders” — not a chunk index.
   */
  ordersTotal?: number | null;
}

export interface AbandonedCommerceOpportunity {
  id: string;
  organizationId: string;
  provider: CommerceProvider;
  externalId: string;
  externalCustomerId: string | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  checkoutUrl: string | null;
  subtotal: number;
  currency: string;
  lastActivityAt: string;
  completedAt: string | null;
  convertedOrderExternalId: string | null;
  shopifyCreatedAt: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
}

export interface AbandonedCommerceOpportunityItem {
  id: string;
  checkoutId: string;
  externalLineItemId: string;
  externalProductId: string | null;
  externalVariantId: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
}

export interface ShopifyAbandonedSyncSummary {
  checkoutsRead: number;
  checkoutsAdded: number;
  checkoutsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  hasMore?: boolean;
  nextCursor?: string | null;
  pagesFetched?: number;
  complete?: boolean;
  mode?: "incremental" | "full";
  incrementalFrom?: string | null;
}

export function emptyShopifyAbandonedSyncSummary(): ShopifyAbandonedSyncSummary {
  return {
    checkoutsRead: 0,
    checkoutsAdded: 0,
    checkoutsUpdated: 0,
    recordsSkipped: 0,
    errors: [],
    hasMore: false,
    nextCursor: null,
    pagesFetched: 0,
    complete: true,
    mode: "incremental",
    incrementalFrom: null,
  };
}

export interface ShopifyCatalogSyncSummary {
  productsRead: number;
  productsAdded: number;
  productsUpdated: number;
  variantsAdded: number;
  variantsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  hasMore?: boolean;
  nextCursor?: string | null;
  pagesFetched?: number;
  complete?: boolean;
  mode?: "incremental" | "full";
  incrementalFrom?: string | null;
}

export function emptyShopifyCatalogSyncSummary(): ShopifyCatalogSyncSummary {
  return {
    productsRead: 0,
    productsAdded: 0,
    productsUpdated: 0,
    variantsAdded: 0,
    variantsUpdated: 0,
    recordsSkipped: 0,
    errors: [],
    hasMore: false,
    nextCursor: null,
    pagesFetched: 0,
    complete: true,
    mode: "incremental",
    incrementalFrom: null,
  };
}

export function mergeShopifyCatalogSyncSummaries(
  a: ShopifyCatalogSyncSummary,
  b: ShopifyCatalogSyncSummary,
): ShopifyCatalogSyncSummary {
  return {
    productsRead: a.productsRead + b.productsRead,
    productsAdded: a.productsAdded + b.productsAdded,
    productsUpdated: a.productsUpdated + b.productsUpdated,
    variantsAdded: a.variantsAdded + b.variantsAdded,
    variantsUpdated: a.variantsUpdated + b.variantsUpdated,
    recordsSkipped: a.recordsSkipped + b.recordsSkipped,
    errors: [...a.errors, ...b.errors].slice(0, 20),
    hasMore: b.hasMore ?? a.hasMore,
    nextCursor: b.nextCursor ?? a.nextCursor,
    pagesFetched: (a.pagesFetched ?? 0) + (b.pagesFetched ?? 0),
    complete: b.complete ?? a.complete,
    mode: b.mode ?? a.mode,
    incrementalFrom: b.incrementalFrom ?? a.incrementalFrom,
  };
}

export function mergeShopifyAbandonedSyncSummaries(
  a: ShopifyAbandonedSyncSummary,
  b: ShopifyAbandonedSyncSummary,
): ShopifyAbandonedSyncSummary {
  return {
    checkoutsRead: a.checkoutsRead + b.checkoutsRead,
    checkoutsAdded: a.checkoutsAdded + b.checkoutsAdded,
    checkoutsUpdated: a.checkoutsUpdated + b.checkoutsUpdated,
    recordsSkipped: a.recordsSkipped + b.recordsSkipped,
    errors: [...a.errors, ...b.errors].slice(0, 20),
    hasMore: Boolean(b.hasMore),
    nextCursor: b.nextCursor ?? null,
    pagesFetched: (a.pagesFetched ?? 0) + (b.pagesFetched ?? 0),
    complete: Boolean(b.complete),
    mode: b.mode ?? a.mode ?? "incremental",
    incrementalFrom: b.incrementalFrom ?? a.incrementalFrom ?? null,
  };
}

export interface CommerceCustomerDiagnostic {
  externalId: string;
  displayName: string;
  phoneMasked: string | null;
  emailMasked: string | null;
  latestValidOrderAt: string | null;
  orderCount: number;
  lastOrderNumber: string | null;
  lastOrderDate: string | null;
  fulfilmentCount: number;
  carriers: string[];
  awbAvailable: boolean;
}

export type DiagnosticsPageOptions = {
  /** 1-based page index */
  page?: number;
  pageSize?: number;
};

export type CommerceDiagnosticsPage = {
  rows: CommerceCustomerDiagnostic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function emptyShopifySyncSummary(): ShopifySyncSummary {
  return {
    customersRead: 0,
    customersAdded: 0,
    customersUpdated: 0,
    ordersRead: 0,
    ordersAdded: 0,
    ordersUpdated: 0,
    fulfilmentsFound: 0,
    awbsFound: 0,
    recordsSkipped: 0,
    errors: [],
    hasMore: false,
    nextCursor: null,
    pagesFetched: 0,
    complete: true,
    mode: "incremental",
    incrementalFrom: null,
    ordersTotal: null,
  };
}

export function mergeShopifySyncSummaries(
  a: ShopifySyncSummary,
  b: ShopifySyncSummary,
): ShopifySyncSummary {
  return {
    customersRead: a.customersRead + b.customersRead,
    customersAdded: a.customersAdded + b.customersAdded,
    customersUpdated: a.customersUpdated + b.customersUpdated,
    ordersRead: a.ordersRead + b.ordersRead,
    ordersAdded: a.ordersAdded + b.ordersAdded,
    ordersUpdated: a.ordersUpdated + b.ordersUpdated,
    fulfilmentsFound: a.fulfilmentsFound + b.fulfilmentsFound,
    awbsFound: a.awbsFound + b.awbsFound,
    recordsSkipped: a.recordsSkipped + b.recordsSkipped,
    errors: [...a.errors, ...b.errors].slice(0, 20),
    hasMore: Boolean(b.hasMore),
    nextCursor: b.nextCursor ?? null,
    pagesFetched: (a.pagesFetched ?? 0) + (b.pagesFetched ?? 0),
    complete: Boolean(b.complete),
    mode: b.mode ?? a.mode ?? "incremental",
    incrementalFrom: b.incrementalFrom ?? a.incrementalFrom ?? null,
    ordersTotal: b.ordersTotal ?? a.ordersTotal ?? null,
  };
}

/** Mask phone for diagnostics — keep last 4 digits only. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}

/** Mask email — keep domain, redact local part. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 1) return "••••@••••";
  return `••••@${email.slice(at + 1)}`;
}
