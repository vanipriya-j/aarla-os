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
  lineItems: ShopifyLineItemRecord[];
  fulfilments: ShopifyFulfilmentRecord[];
}

export interface ShopifyCustomerCallPayload {
  customers: ShopifyCustomerRecord[];
  orders: ShopifyOrderRecord[];
}

export interface ShopifyConnector {
  readonly provider: "shopify";
  fetchCustomerCallPayload(): Promise<ShopifyCustomerCallPayload>;
}
