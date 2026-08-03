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
