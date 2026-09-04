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
  /** Orders per GraphQL page (default 15 — keeps upserts under Vercel 60s) */
  pageSize?: number;
  /**
   * Optional Shopify orders search query, e.g. created_at:>'2026-01-01T00:00:00Z'
   * Used for incremental sync.
   */
  query?: string | null;
  /**
   * When true, also load inventoryItem.id (needs live read_inventory).
   * Location-scoped Available also needs read_inventory.
   */
  includeInventoryItems?: boolean;
  /**
   * Shopify location gid for Available qty (Aarla Office).
   * When set, inventory is read at this location only — not store-wide totals.
   */
  locationId?: string | null;
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

export interface ShopifyProductVariantRecord {
  externalVariantId: string;
  sku: string;
  title: string;
  price: number;
  selectedOptions: Array<{ name: string; value: string }>;
  position: number;
}

export interface ShopifyProductRecord {
  externalProductId: string;
  title: string;
  handle: string;
  status: string;
  productType: string;
  vendor: string;
  tags: string[];
  updatedAt: string;
  variants: ShopifyProductVariantRecord[];
}

export type ShopifyProductsPage = {
  products: ShopifyProductRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  pagesFetched: number;
};

export interface ShopifyVariantInventoryRecord {
  externalVariantId: string;
  sku: string;
  /**
   * Store-wide sellable Available (Shopify inventoryQuantity).
   * Partner stock is Aarla-only — not read from Shopify locations.
   */
  available: number;
  /** gid://shopify/InventoryItem/... when available from Admin API */
  inventoryItemId?: string | null;
  /** Shopify push location gid when known; reads may leave null */
  locationId?: string | null;
  /** Source label for Available (e.g. "Shopify") */
  locationName?: string | null;
  /** Same as available for shop-total reads (diagnostics) */
  shopTotal?: number | null;
  /** Short qty summary for UI */
  levelSummary?: string | null;
}

export type ShopifyVariantInventoryPage = {
  variants: ShopifyVariantInventoryRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  pagesFetched: number;
};

export type ShopifySetInventoryQuantityInput = {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
};

export type ShopifySetInventoryResult = {
  ok: boolean;
  errors: string[];
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
  /** Chunked catalog products — optional; skipped when unimplemented. */
  fetchProductsPage?(options?: ShopifyFetchOptions): Promise<ShopifyProductsPage>;
  /**
   * Chunked variant inventory — store-wide inventoryQuantity (studio stock on Shopify).
   * Used for opening balances, drift compare, and sync.
   */
  fetchVariantInventoryPage?(
    options?: ShopifyFetchOptions,
  ): Promise<ShopifyVariantInventoryPage>;
  /**
   * Fetch store-wide Available for specific Shopify variant ids.
   */
  fetchVariantsInventoryByIds?(
    externalVariantIds: string[],
    options?: { locationId?: string | null },
  ): Promise<ShopifyVariantInventoryRecord[]>;
  /**
   * Preferred Shopify location for Push (inventorySetQuantities).
   * Prefers "Aarla Office" / SHOPIFY_AARLA_OFFICE_LOCATION_ID when set.
   */
  fetchPrimaryInventoryLocationId?(): Promise<string | null>;
  /** Set absolute available qty on Shopify for one or more inventory items. */
  setInventoryQuantities?(
    quantities: ShopifySetInventoryQuantityInput[],
  ): Promise<ShopifySetInventoryResult>;
  /**
   * Total orders matching an optional search query (for “Loaded X of Y” progress).
   * Optional — UI falls back to Loaded X orders when missing.
   */
  fetchOrdersCount?(query?: string | null): Promise<number | null>;
}
