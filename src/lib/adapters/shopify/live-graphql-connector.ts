/**
 * Live Shopify GraphQL Admin connector — SERVER ONLY.
 *
 * Never import this module from React client components or any browser-bound path.
 * Credentials are read from process.env and must never use NEXT_PUBLIC_ prefixes.
 *
 * Auth modes:
 * - Dev Dashboard: SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (+ store domain)
 * - Legacy static: SHOPIFY_ADMIN_API_ACCESS_TOKEN
 */

import type {
  ShopifyConnector,
  ShopifyCustomerCallPage,
  ShopifyCustomerCallPayload,
  ShopifyCustomerRecord,
  ShopifyFetchOptions,
  ShopifyFulfilmentRecord,
  ShopifyLineItemRecord,
  ShopifyOrderRecord,
} from "./port";
import { shopifyGidToExternalId } from "./normalize";
import {
  normalizeShopifyShopDomain,
  readShopifyAuthConfigFromEnv,
  resolveShopifyAccessToken,
  type ShopifyAuthConfig,
} from "./auth";

export type LiveShopifyConfig = ShopifyAuthConfig;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "LiveShopifyGraphqlConnector must not run in the browser. Use server actions only.",
    );
  }
}

export function readLiveShopifyConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LiveShopifyConfig | null {
  return readShopifyAuthConfigFromEnv(env);
}

const ORDERS_QUERY = `
query SyncOrders($cursor: String) {
  orders(first: 50, after: $cursor, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        name
        createdAt
        cancelledAt
        test
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        customer {
          id
          displayName
          firstName
          lastName
          defaultPhoneNumber { phoneNumber }
          defaultEmailAddress { emailAddress }
          emailMarketingConsent { marketingState }
        }
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              variantTitle
              quantity
              originalUnitPriceSet { shopMoney { amount } }
              product { id }
              variant { id }
            }
          }
        }
        fulfillments(first: 10) {
          id
          status
          trackingInfo {
            company
            number
            url
          }
        }
      }
    }
  }
}
`;

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type OrdersQueryData = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: RawOrderNode }>;
  };
};

type RawOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  test: boolean;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
  customer: {
    id: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    defaultPhoneNumber?: { phoneNumber?: string | null } | null;
    defaultEmailAddress?: { emailAddress?: string | null } | null;
    emailMarketingConsent?: { marketingState?: string | null } | null;
  } | null;
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        variantTitle?: string | null;
        quantity: number;
        originalUnitPriceSet?: { shopMoney?: { amount?: string } };
        product?: { id?: string } | null;
        variant?: { id?: string } | null;
      };
    }>;
  };
  fulfillments: Array<{
    id: string;
    status?: string | null;
    trackingInfo?: Array<{
      company?: string | null;
      number?: string | null;
      url?: string | null;
    }>;
  }>;
};

function customerName(c: NonNullable<RawOrderNode["customer"]>): string {
  if (c.displayName?.trim()) return c.displayName.trim();
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : "Shopify customer";
}

function mapOrder(node: RawOrderNode): {
  order: ShopifyOrderRecord;
  customer: ShopifyCustomerRecord | null;
} {
  const customerExt = shopifyGidToExternalId(node.customer?.id);
  const customer: ShopifyCustomerRecord | null =
    node.customer && customerExt
      ? {
          externalId: customerExt,
          name: customerName(node.customer),
          phone: node.customer.defaultPhoneNumber?.phoneNumber ?? null,
          email: node.customer.defaultEmailAddress?.emailAddress ?? null,
          marketingConsentStatus:
            node.customer.emailMarketingConsent?.marketingState ?? null,
        }
      : null;

  const lineItems: ShopifyLineItemRecord[] = node.lineItems.edges.map(({ node: li }) => ({
    externalLineItemId: shopifyGidToExternalId(li.id) ?? li.id,
    externalProductId: shopifyGidToExternalId(li.product?.id ?? null),
    externalVariantId: shopifyGidToExternalId(li.variant?.id ?? null),
    title: li.title,
    variantTitle: li.variantTitle ?? null,
    quantity: li.quantity,
    unitPrice: Number(li.originalUnitPriceSet?.shopMoney?.amount ?? 0),
  }));

  const fulfilments: ShopifyFulfilmentRecord[] = [];
  for (const ful of node.fulfillments ?? []) {
    const tracking = ful.trackingInfo?.[0];
    fulfilments.push({
      externalId: shopifyGidToExternalId(ful.id) ?? ful.id,
      trackingCompany: tracking?.company ?? null,
      trackingNumber: tracking?.number ?? null,
      trackingUrl: tracking?.url ?? null,
      fulfilmentStatus: ful.status ?? null,
    });
  }

  return {
    customer,
    order: {
      externalId: shopifyGidToExternalId(node.id) ?? node.id,
      orderNumber: node.name,
      externalCustomerId: customerExt,
      orderDate: node.createdAt,
      financialStatus: node.displayFinancialStatus,
      fulfilmentStatus: node.displayFulfillmentStatus,
      cancelledAt: node.cancelledAt,
      isTest: Boolean(node.test),
      totalAmount: Number(node.totalPriceSet?.shopMoney?.amount ?? 0),
      currency: node.totalPriceSet?.shopMoney?.currencyCode ?? "INR",
      lineItems,
      fulfilments,
    },
  };
}

export class LiveShopifyGraphqlConnector implements ShopifyConnector {
  readonly provider = "shopify" as const;
  private readonly config: LiveShopifyConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LiveShopifyConfig, fetchImpl: typeof fetch = fetch) {
    assertServerOnly();
    this.config = {
      ...config,
      storeDomain: normalizeShopifyShopDomain(config.storeDomain),
    };
    this.fetchImpl = fetchImpl;
  }

  private endpoint(): string {
    return `https://${this.config.storeDomain}/admin/api/${this.config.apiVersion}/graphql.json`;
  }

  private async accessToken(): Promise<string> {
    return resolveShopifyAccessToken(this.config, this.fetchImpl);
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    assertServerOnly();
    const token = await this.accessToken();
    const res = await this.fetchImpl(this.endpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      throw new Error(`Shopify Admin API HTTP ${res.status}`);
    }
    const body = (await res.json()) as GraphqlResponse<T>;
    if (body.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${body.errors[0]?.message ?? "unknown"}`);
    }
    if (!body.data) {
      throw new Error("Shopify GraphQL returned empty data");
    }
    return body.data;
  }

  async fetchCustomerCallPage(
    options: ShopifyFetchOptions = {},
  ): Promise<ShopifyCustomerCallPage> {
    assertServerOnly();
    const customers = new Map<string, ShopifyCustomerRecord>();
    const orders: ShopifyOrderRecord[] = [];
    let cursor: string | null = options.cursor ?? null;
    let hasNext = true;
    let pages = 0;
    // Keep each serverless invocation short (Vercel timeouts).
    const maxPages = Math.max(1, Math.min(options.maxPages ?? 1, 10));

    while (hasNext && pages < maxPages) {
      pages += 1;
      const variables: { cursor: string | null } = { cursor };
      const data: OrdersQueryData = await this.graphql<OrdersQueryData>(
        ORDERS_QUERY,
        variables,
      );
      for (const edge of data.orders.edges) {
        const mapped = mapOrder(edge.node);
        if (mapped.customer) {
          customers.set(mapped.customer.externalId, mapped.customer);
        }
        orders.push(mapped.order);
      }
      hasNext = data.orders.pageInfo.hasNextPage;
      cursor = data.orders.pageInfo.endCursor;
    }

    return {
      customers: [...customers.values()],
      orders,
      hasMore: hasNext,
      nextCursor: hasNext ? cursor : null,
      pagesFetched: pages,
    };
  }

  async fetchCustomerCallPayload(
    options: ShopifyFetchOptions = {},
  ): Promise<ShopifyCustomerCallPayload> {
    // Back-compat: pull up to a bounded number of pages in one call.
    const page = await this.fetchCustomerCallPage({
      cursor: options.cursor,
      maxPages: options.maxPages ?? 1,
    });
    return { customers: page.customers, orders: page.orders };
  }
}

export function createLiveShopifyConnectorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LiveShopifyGraphqlConnector | null {
  const config = readLiveShopifyConfigFromEnv(env);
  if (!config) return null;
  return new LiveShopifyGraphqlConnector(config);
}
