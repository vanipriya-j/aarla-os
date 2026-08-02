import type {
  ShopifyConnector,
  ShopifyCustomerCallPage,
  ShopifyCustomerCallPayload,
  ShopifyCustomerRecord,
  ShopifyFetchOptions,
  ShopifyOrderRecord,
} from "./port";

const FIXTURE_CUSTOMERS: ShopifyCustomerRecord[] = [
  {
    externalId: "1001",
    name: "Ananya Sharma",
    phone: "+91 98765 01001",
    email: "ananya.fixture@aarla.test",
    marketingConsentStatus: "SUBSCRIBED",
  },
  {
    externalId: "1002",
    name: "Rohan Patel",
    phone: "+91 98765 01002",
    email: "rohan.fixture@aarla.test",
    marketingConsentStatus: "NOT_SUBSCRIBED",
  },
  {
    externalId: "1003",
    name: "Kavya Nair",
    phone: "+91 98765 01003",
    email: null,
    marketingConsentStatus: null,
  },
];

const FIXTURE_ORDERS: ShopifyOrderRecord[] = [
  {
    externalId: "5001",
    orderNumber: "#10450",
    externalCustomerId: "1001",
    orderDate: "2026-07-20T10:00:00.000Z",
    financialStatus: "PAID",
    fulfilmentStatus: "FULFILLED",
    cancelledAt: null,
    isTest: false,
    totalAmount: 1890,
    currency: "INR",
    lineItems: [
      {
        externalLineItemId: "li-5001-1",
        externalProductId: "prod-tumbler",
        externalVariantId: "var-brass",
        title: "Lakshmi Brass Davara Tumbler",
        variantTitle: "Brass",
        quantity: 1,
        unitPrice: 1290,
      },
      {
        externalLineItemId: "li-5001-2",
        externalProductId: "prod-magnet",
        externalVariantId: null,
        title: "Ganapathi Magnet Set",
        variantTitle: null,
        quantity: 1,
        unitPrice: 600,
      },
    ],
    fulfilments: [
      {
        externalId: "ful-5001",
        trackingCompany: "Delhivery",
        trackingNumber: "AWB1001DEL",
        trackingUrl: "https://www.delhivery.com/track/package/AWB1001DEL",
        fulfilmentStatus: "SUCCESS",
      },
    ],
  },
  {
    externalId: "5002",
    orderNumber: "#10451",
    externalCustomerId: "1001",
    orderDate: "2026-07-28T14:30:00.000Z",
    financialStatus: "PAID",
    fulfilmentStatus: "FULFILLED",
    cancelledAt: null,
    isTest: false,
    totalAmount: 2490,
    currency: "INR",
    lineItems: [
      {
        externalLineItemId: "li-5002-1",
        externalProductId: "prod-bottle",
        externalVariantId: "var-750",
        title: "Muruga Water Bottle",
        variantTitle: "750ml",
        quantity: 2,
        unitPrice: 1245,
      },
    ],
    fulfilments: [
      {
        externalId: "ful-5002",
        trackingCompany: "Delhivery",
        trackingNumber: "AWB1002DEL",
        trackingUrl: "https://www.delhivery.com/track/package/AWB1002DEL",
        fulfilmentStatus: "SUCCESS",
      },
    ],
  },
  {
    externalId: "5003",
    orderNumber: "#10452",
    externalCustomerId: "1002",
    orderDate: "2026-06-15T09:00:00.000Z",
    financialStatus: "PAID",
    fulfilmentStatus: "PARTIAL",
    cancelledAt: null,
    isTest: false,
    totalAmount: 990,
    currency: "INR",
    lineItems: [
      {
        externalLineItemId: "li-5003-1",
        externalProductId: "prod-tote",
        externalVariantId: null,
        title: "Chennai Market Tote",
        variantTitle: null,
        quantity: 1,
        unitPrice: 990,
      },
    ],
    fulfilments: [
      {
        externalId: "ful-5003",
        trackingCompany: "BlueDart",
        trackingNumber: null,
        trackingUrl: null,
        fulfilmentStatus: "PENDING",
      },
    ],
  },
  {
    externalId: "5004",
    orderNumber: "#10453",
    externalCustomerId: "1002",
    orderDate: "2026-07-01T11:00:00.000Z",
    financialStatus: "PAID",
    fulfilmentStatus: "FULFILLED",
    cancelledAt: "2026-07-02T08:00:00.000Z",
    isTest: false,
    totalAmount: 1500,
    currency: "INR",
    lineItems: [
      {
        externalLineItemId: "li-5004-1",
        externalProductId: "prod-hamper",
        externalVariantId: null,
        title: "Cancelled Festival Hamper",
        variantTitle: null,
        quantity: 1,
        unitPrice: 1500,
      },
    ],
    fulfilments: [],
  },
  {
    externalId: "5005",
    orderNumber: "#10454",
    externalCustomerId: "1003",
    orderDate: "2026-07-10T12:00:00.000Z",
    financialStatus: "REFUNDED",
    fulfilmentStatus: "FULFILLED",
    cancelledAt: null,
    isTest: false,
    totalAmount: 800,
    currency: "INR",
    lineItems: [
      {
        externalLineItemId: "li-5005-1",
        externalProductId: "prod-card",
        externalVariantId: null,
        title: "Story Card Pack",
        variantTitle: null,
        quantity: 1,
        unitPrice: 800,
      },
    ],
    fulfilments: [],
  },
  {
    externalId: "5006",
    orderNumber: "#10455",
    externalCustomerId: "1003",
    orderDate: "2026-07-12T12:00:00.000Z",
    financialStatus: "PAID",
    fulfilmentStatus: null,
    cancelledAt: null,
    isTest: true,
    totalAmount: 100,
    currency: "INR",
    lineItems: [
      {
        externalLineItemId: "li-5006-1",
        externalProductId: "prod-test",
        externalVariantId: null,
        title: "Test SKU",
        variantTitle: null,
        quantity: 1,
        unitPrice: 100,
      },
    ],
    fulfilments: [],
  },
  {
    externalId: "5007",
    orderNumber: "#10456",
    externalCustomerId: null,
    orderDate: "2026-07-14T12:00:00.000Z",
    financialStatus: "PAID",
    fulfilmentStatus: null,
    cancelledAt: null,
    isTest: false,
    totalAmount: 500,
    currency: "INR",
    lineItems: [
      {
        externalLineItemId: "li-5007-1",
        externalProductId: "prod-guest",
        externalVariantId: null,
        title: "Guest Checkout Item",
        variantTitle: null,
        quantity: 1,
        unitPrice: 500,
      },
    ],
    fulfilments: [],
  },
];

export type FixtureShopifyOptions = {
  /** When set, fetch throws after returning nothing — simulates upstream failure. */
  failHard?: boolean;
  /** When set, payload is returned then a secondary error string is expected by the service. */
  partialError?: string | null;
  customers?: ShopifyCustomerRecord[];
  orders?: ShopifyOrderRecord[];
};

/**
 * Deterministic Shopify payload for automated tests.
 * Never talks to the live Shopify store.
 */
export class FixtureShopifyConnector implements ShopifyConnector {
  readonly provider = "shopify" as const;
  private readonly options: FixtureShopifyOptions;

  constructor(options: FixtureShopifyOptions = {}) {
    this.options = options;
  }

  async fetchCustomerCallPayload(): Promise<ShopifyCustomerCallPayload> {
    if (this.options.failHard) {
      throw new Error(this.options.partialError || "Shopify Admin API unavailable");
    }
    return {
      customers: this.options.customers ?? FIXTURE_CUSTOMERS,
      orders: this.options.orders ?? FIXTURE_ORDERS,
    };
  }

  async fetchCustomerCallPage(
    options: ShopifyFetchOptions = {},
  ): Promise<ShopifyCustomerCallPage> {
    void options;
    const payload = await this.fetchCustomerCallPayload();
    return {
      ...payload,
      hasMore: false,
      nextCursor: null,
      pagesFetched: 1,
    };
  }
}

export function createDefaultFixturePayload(): ShopifyCustomerCallPayload {
  return {
    customers: structuredClone(FIXTURE_CUSTOMERS),
    orders: structuredClone(FIXTURE_ORDERS),
  };
}
