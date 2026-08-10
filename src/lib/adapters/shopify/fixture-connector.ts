import type {
  ShopifyAbandonedCheckoutPage,
  ShopifyAbandonedCheckoutRecord,
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
    contactPhone: null,
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
    contactPhone: null,
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
    contactPhone: null,
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
    contactPhone: null,
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
    contactPhone: null,
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
    contactPhone: null,
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
    contactPhone: null,
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

const FIXTURE_ABANDONED_CHECKOUTS: ShopifyAbandonedCheckoutRecord[] = [
  {
    externalId: "9001",
    externalCustomerId: "1004",
    customerName: "Divya Krishnan",
    phone: "+91 98765 01004",
    email: "divya.fixture@aarla.test",
    checkoutUrl: "https://aarla-fixture.myshopify.com/checkouts/abcd9001",
    subtotal: 2150,
    currency: "INR",
    createdAt: "2026-08-05T09:15:00.000Z",
    lastActivityAt: "2026-08-05T09:20:00.000Z",
    completedAt: null,
    lineItems: [
      {
        externalLineItemId: "li-9001-1",
        externalProductId: "prod-lamp",
        externalVariantId: "var-brass-lamp",
        title: "Kuthu Vilakku Brass Lamp",
        variantTitle: "Brass",
        quantity: 1,
        unitPrice: 2150,
      },
    ],
  },
  {
    externalId: "9002",
    externalCustomerId: "1005",
    customerName: "Guest checkout",
    phone: null,
    email: "guest.fixture@aarla.test",
    checkoutUrl: "https://aarla-fixture.myshopify.com/checkouts/abcd9002",
    subtotal: 500,
    currency: "INR",
    createdAt: "2026-08-04T11:00:00.000Z",
    lastActivityAt: "2026-08-04T11:05:00.000Z",
    completedAt: null,
    lineItems: [
      {
        externalLineItemId: "li-9002-1",
        externalProductId: "prod-card",
        externalVariantId: null,
        title: "Story Card Pack",
        variantTitle: null,
        quantity: 1,
        unitPrice: 500,
      },
    ],
  },
  {
    externalId: "9003",
    externalCustomerId: "1001",
    customerName: "Ananya Sharma",
    phone: "+91 98765 01001",
    email: "ananya.fixture@aarla.test",
    checkoutUrl: "https://aarla-fixture.myshopify.com/checkouts/abcd9003",
    subtotal: 1290,
    currency: "INR",
    createdAt: "2026-07-25T08:00:00.000Z",
    lastActivityAt: "2026-07-25T08:10:00.000Z",
    completedAt: "2026-07-25T08:12:00.000Z",
    lineItems: [
      {
        externalLineItemId: "li-9003-1",
        externalProductId: "prod-tumbler",
        externalVariantId: "var-brass",
        title: "Lakshmi Brass Davara Tumbler",
        variantTitle: "Brass",
        quantity: 1,
        unitPrice: 1290,
      },
    ],
  },
];

export type FixtureShopifyOptions = {
  /** When set, fetch throws after returning nothing — simulates upstream failure. */
  failHard?: boolean;
  /** When set, payload is returned then a secondary error string is expected by the service. */
  partialError?: string | null;
  customers?: ShopifyCustomerRecord[];
  orders?: ShopifyOrderRecord[];
  abandonedCheckouts?: ShopifyAbandonedCheckoutRecord[];
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
    const payload = await this.fetchCustomerCallPayload();
    let orders = payload.orders;
    let customers = payload.customers;

    const match = options.query?.match(/created_at:>'([^']+)'/);
    if (match?.[1]) {
      const afterMs = new Date(match[1]).getTime();
      if (Number.isFinite(afterMs)) {
        orders = orders.filter((o) => new Date(o.orderDate).getTime() > afterMs);
        const ids = new Set(
          orders.map((o) => o.externalCustomerId).filter((id): id is string => Boolean(id)),
        );
        customers = customers.filter((c) => ids.has(c.externalId));
      }
    }

    // Targeted phone backfill: name:"#10450" OR name:#10451
    if (options.query && /name:/i.test(options.query)) {
      const names = [
        ...options.query.matchAll(/name:(?:"([^"]+)"|#?([\w-]+))/g),
      ].map((m) => {
        const raw = (m[1] ?? m[2] ?? "").trim();
        return raw.startsWith("#") ? raw : `#${raw}`;
      });
      if (names.length) {
        const want = new Set(names);
        orders = orders.filter((o) => {
          const n = o.orderNumber.startsWith("#") ? o.orderNumber : `#${o.orderNumber}`;
          return want.has(n);
        });
        const ids = new Set(
          orders.map((o) => o.externalCustomerId).filter((id): id is string => Boolean(id)),
        );
        customers = customers.filter((c) => ids.has(c.externalId));
      }
    }

    return {
      customers,
      orders,
      hasMore: false,
      nextCursor: null,
      pagesFetched: 1,
    };
  }

  async fetchAbandonedCheckoutsPage(
    options: ShopifyFetchOptions = {},
  ): Promise<ShopifyAbandonedCheckoutPage> {
    if (this.options.failHard) {
      throw new Error(this.options.partialError || "Shopify Admin API unavailable");
    }
    let checkouts = this.options.abandonedCheckouts ?? FIXTURE_ABANDONED_CHECKOUTS;

    const match = options.query?.match(/created_at:>=?'([^']+)'/);
    if (match?.[1]) {
      const afterMs = new Date(match[1]).getTime();
      if (Number.isFinite(afterMs)) {
        checkouts = checkouts.filter((c) => new Date(c.createdAt).getTime() >= afterMs);
      }
    }

    return {
      checkouts,
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

export function createDefaultFixtureAbandonedCheckouts(): ShopifyAbandonedCheckoutRecord[] {
  return structuredClone(FIXTURE_ABANDONED_CHECKOUTS);
}
