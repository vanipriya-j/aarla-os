/**
 * Shopify connector port for Customer Calls commerce sync.
 *
 * Live Admin API access must stay server-side. UI never imports the live client.
 * Tests use FixtureShopifyConnector — never the live store.
 */

export interface ShopifyCustomerRecord {
  externalId: string;
  name: string;
  phone: string | null;
  email: string | null;
  marketingConsentStatus: string | null;
}

export interface ShopifyLineItemRecord {
  externalLineItemId: string;
  externalProductId: string | null;
  externalVariantId: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
}

export interface ShopifyFulfilmentRecord {
  externalId: string;
  trackingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  fulfilmentStatus: string | null;
}

export interface ShopifyTaxLineRecord {
  title: string | null;
  price: number;
  rate: number | null;
}

export interface ShopifyOrderRecord {
  externalId: string;
  orderNumber: string;
  externalCustomerId: string | null;
  orderDate: string;
  financialStatus: string | null;
  fulfilmentStatus: string | null;
  cancelledAt: string | null;
  isTest: boolean;
  totalAmount: number;
  currency: string;
  /** Best phone from customer/shipping/billing at sync time. */
  contactPhone: string | null;
  /** GST / tax fields — optional; null means not captured (never invent). */
  taxesIncluded?: boolean | null;
  subtotalAmount?: number | null;
  totalDiscounts?: number | null;
  shippingAmount?: number | null;
  shippingTax?: number | null;
  totalTax?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  taxableAmount?: number | null;
  totalRefunded?: number | null;
  shippingProvince?: string | null;
  shippingCountry?: string | null;
  customerGstin?: string | null;
  taxLines?: ShopifyTaxLineRecord[];
  lineItems: ShopifyLineItemRecord[];
  fulfilments: ShopifyFulfilmentRecord[];
}

export interface ShopifyCustomerCallPayload {
  customers: ShopifyCustomerRecord[];
  orders: ShopifyOrderRecord[];
}

export type ShopifyFetchOptions = {
  /** GraphQL endCursor from a previous page; null/undefined = start */
  cursor?: string | null;
  /** Max order connection pages to fetch in this call (default connector-specific) */
  maxPages?: number;
  /**
   * Optional Shopify orders search query, e.g. created_at:>'2026-01-01T00:00:00Z'
   * Used for incremental sync.
   */
  query?: string | null;
};

export type ShopifyCustomerCallPage = ShopifyCustomerCallPayload & {
  hasMore: boolean;
  nextCursor: string | null;
  pagesFetched: number;
};

export interface ShopifyAbandonedCheckoutLineItem {
  externalLineItemId: string;
  externalProductId: string | null;
  externalVariantId: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
}

export interface ShopifyAbandonedCheckoutRecord {
  externalId: string;
  externalCustomerId: string | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  checkoutUrl: string | null;
  subtotal: number;
  currency: string;
  createdAt: string;
  /** Checkout updatedAt */
  lastActivityAt: string;
  completedAt: string | null;
  lineItems: ShopifyAbandonedCheckoutLineItem[];
}

export type ShopifyAbandonedCheckoutPage = {
  checkouts: ShopifyAbandonedCheckoutRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  pagesFetched: number;
};

export interface ShopifyConnector {
  readonly provider: "shopify";
  /** Full fetch (fixtures / small stores). Live connector may still page internally. */
  fetchCustomerCallPayload(options?: ShopifyFetchOptions): Promise<ShopifyCustomerCallPayload>;
  /** Chunked fetch for serverless timeouts. */
  fetchCustomerCallPage?(options?: ShopifyFetchOptions): Promise<ShopifyCustomerCallPage>;
  /** Chunked fetch of abandoned checkouts — optional; skipped when unimplemented. */
  fetchAbandonedCheckoutsPage?(
    options?: ShopifyFetchOptions,
  ): Promise<ShopifyAbandonedCheckoutPage>;
}
