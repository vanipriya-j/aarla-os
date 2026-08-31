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
  ShopifyAbandonedCheckoutLineItem,
  ShopifyAbandonedCheckoutPage,
  ShopifyAbandonedCheckoutRecord,
  ShopifyConnector,
  ShopifyCustomerCallPage,
  ShopifyCustomerCallPayload,
  ShopifyCustomerRecord,
  ShopifyFetchOptions,
  ShopifyFulfilmentRecord,
  ShopifyLineItemRecord,
  ShopifyOrderRecord,
  ShopifyTaxLineRecord,
} from "./port";
import { shopifyGidToExternalId } from "./normalize";
import {
  normalizeShopifyShopDomain,
  readShopifyAuthConfigFromEnv,
  resolveShopifyAccessToken,
  type ShopifyAuthConfig,
} from "./auth";
import { aggregateTaxLines } from "@/lib/domain/gst-validation";

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

const ORDERS_COUNT_QUERY = `
query SyncOrdersCount($query: String) {
  ordersCount(query: $query) {
    count
  }
}
`;

type OrdersCountQueryData = {
  ordersCount: { count: number };
};

const ORDERS_QUERY = `
query SyncOrders($cursor: String, $query: String, $pageSize: Int!) {
  orders(first: $pageSize, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        name
        createdAt
        cancelledAt
        test
        taxesIncluded
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        currentSubtotalPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalRefundedSet { shopMoney { amount } }
        taxLines {
          title
          rate
          priceSet { shopMoney { amount } }
        }
        shippingLine {
          discountedPriceSet { shopMoney { amount } }
          taxLines {
            title
            rate
            priceSet { shopMoney { amount } }
          }
        }
        shippingAddress {
          phone
          province
          countryCodeV2
        }
        billingAddress { phone }
        customer {
          id
          displayName
          firstName
          lastName
          phone
          defaultPhoneNumber { phoneNumber }
          defaultEmailAddress { emailAddress }
          defaultAddress { phone }
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

const ABANDONED_CHECKOUTS_QUERY = `
query SyncAbandonedCheckouts($cursor: String, $query: String) {
  abandonedCheckouts(first: 50, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        abandonedCheckoutUrl
        createdAt
        updatedAt
        completedAt
        subtotalPriceSet { shopMoney { amount currencyCode } }
        customer {
          id
          displayName
          firstName
          lastName
          phone
          defaultPhoneNumber { phoneNumber }
          email
        }
        billingAddress { phone }
        shippingAddress { phone }
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

type MoneySet = { shopMoney?: { amount?: string; currencyCode?: string } } | null | undefined;

type RawTaxLine = {
  title?: string | null;
  rate?: number | null;
  priceSet?: MoneySet;
};

type RawOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  test: boolean;
  taxesIncluded?: boolean | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  totalPriceSet?: MoneySet;
  currentSubtotalPriceSet?: MoneySet;
  totalDiscountsSet?: MoneySet;
  totalShippingPriceSet?: MoneySet;
  totalTaxSet?: MoneySet;
  totalRefundedSet?: MoneySet;
  taxLines?: RawTaxLine[] | null;
  shippingLine?: {
    discountedPriceSet?: MoneySet;
    taxLines?: RawTaxLine[] | null;
  } | null;
  shippingAddress?: {
    phone?: string | null;
    province?: string | null;
    countryCodeV2?: string | null;
  } | null;
  billingAddress?: { phone?: string | null } | null;
  customer: {
    id: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    defaultPhoneNumber?: { phoneNumber?: string | null } | null;
    defaultEmailAddress?: { emailAddress?: string | null } | null;
    defaultAddress?: { phone?: string | null } | null;
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

function moneyAmount(set: MoneySet): number | null {
  const raw = set?.shopMoney?.amount;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function mapTaxLines(lines: RawTaxLine[] | null | undefined): ShopifyTaxLineRecord[] {
  if (!lines?.length) return [];
  return lines.map((line) => ({
    title: line.title ?? null,
    price: moneyAmount(line.priceSet) ?? 0,
    rate: line.rate == null ? null : Number(line.rate),
  }));
}

type AbandonedCheckoutsQueryData = {
  abandonedCheckouts: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: RawAbandonedCheckoutNode }>;
  };
};

type RawAbandonedCheckoutNode = {
  id: string;
  abandonedCheckoutUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  subtotalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
  customer: {
    id: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    defaultPhoneNumber?: { phoneNumber?: string | null } | null;
    email?: string | null;
  } | null;
  billingAddress?: { phone?: string | null } | null;
  shippingAddress?: { phone?: string | null } | null;
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
};

/** Prefer customer default phone, then customer profile phone, then shipping/billing address. */
export function resolveShopifyAbandonedCheckoutPhone(node: {
  customer?: {
    phone?: string | null;
    defaultPhoneNumber?: { phoneNumber?: string | null } | null;
  } | null;
  shippingAddress?: { phone?: string | null } | null;
  billingAddress?: { phone?: string | null } | null;
}): string | null {
  const candidates = [
    node.customer?.defaultPhoneNumber?.phoneNumber,
    node.customer?.phone,
    node.shippingAddress?.phone,
    node.billingAddress?.phone,
  ];
  for (const raw of candidates) {
    const phone = raw?.trim();
    if (phone) return phone;
  }
  return null;
}

function abandonedCheckoutCustomerName(
  c: RawAbandonedCheckoutNode["customer"],
): string {
  if (!c) return "Shopify customer";
  if (c.displayName?.trim()) return c.displayName.trim();
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : "Shopify customer";
}

function mapAbandonedCheckout(
  node: RawAbandonedCheckoutNode,
): ShopifyAbandonedCheckoutRecord {
  const lineItems: ShopifyAbandonedCheckoutLineItem[] = node.lineItems.edges.map(
    ({ node: li }) => ({
      externalLineItemId: shopifyGidToExternalId(li.id) ?? li.id,
      externalProductId: shopifyGidToExternalId(li.product?.id ?? null),
      externalVariantId: shopifyGidToExternalId(li.variant?.id ?? null),
      title: li.title,
      variantTitle: li.variantTitle ?? null,
      quantity: li.quantity,
      unitPrice: Number(li.originalUnitPriceSet?.shopMoney?.amount ?? 0),
    }),
  );

  return {
    externalId: shopifyGidToExternalId(node.id) ?? node.id,
    externalCustomerId: shopifyGidToExternalId(node.customer?.id ?? null),
    customerName: abandonedCheckoutCustomerName(node.customer),
    phone: resolveShopifyAbandonedCheckoutPhone(node),
    email: node.customer?.email ?? null,
    checkoutUrl: node.abandonedCheckoutUrl ?? null,
    subtotal: Number(node.subtotalPriceSet?.shopMoney?.amount ?? 0),
    currency: node.subtotalPriceSet?.shopMoney?.currencyCode ?? "INR",
    createdAt: node.createdAt,
    lastActivityAt: node.updatedAt,
    completedAt: node.completedAt ?? null,
    lineItems,
  };
}

function customerName(c: NonNullable<RawOrderNode["customer"]>): string {
  if (c.displayName?.trim()) return c.displayName.trim();
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : "Shopify customer";
}

/** Prefer customer profile phone, then default address, then order shipping/billing. */
export function resolveShopifyOrderPhone(node: {
  shippingAddress?: { phone?: string | null } | null;
  billingAddress?: { phone?: string | null } | null;
  customer?: {
    phone?: string | null;
    defaultPhoneNumber?: { phoneNumber?: string | null } | null;
    defaultAddress?: { phone?: string | null } | null;
  } | null;
}): string | null {
  const candidates = [
    node.customer?.defaultPhoneNumber?.phoneNumber,
    node.customer?.phone,
    node.customer?.defaultAddress?.phone,
    node.shippingAddress?.phone,
    node.billingAddress?.phone,
  ];
  for (const raw of candidates) {
    const phone = raw?.trim();
    if (phone) return phone;
  }
  return null;
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
          phone: resolveShopifyOrderPhone(node),
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

  const orderTaxLines = mapTaxLines(node.taxLines);
  const shippingTaxLines = mapTaxLines(node.shippingLine?.taxLines);
  const allTaxLines = [...orderTaxLines, ...shippingTaxLines];
  const buckets = aggregateTaxLines(allTaxLines);
  const shippingTaxTotal = shippingTaxLines.reduce((s, l) => s + l.price, 0);
  const subtotalAmount = moneyAmount(node.currentSubtotalPriceSet);
  const taxesIncluded = node.taxesIncluded ?? null;
  // When taxes are excluded, subtotal is the taxable base. When included, leave null
  // rather than inventing a reverse calculation.
  const taxableAmount =
    taxesIncluded === false ? subtotalAmount : taxesIncluded === true ? null : subtotalAmount;

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
      contactPhone: resolveShopifyOrderPhone(node),
      taxesIncluded,
      subtotalAmount,
      totalDiscounts: moneyAmount(node.totalDiscountsSet),
      shippingAmount:
        moneyAmount(node.shippingLine?.discountedPriceSet) ??
        moneyAmount(node.totalShippingPriceSet),
      shippingTax: shippingTaxTotal > 0 ? shippingTaxTotal : null,
      totalTax: moneyAmount(node.totalTaxSet),
      cgst: allTaxLines.length ? buckets.cgst : null,
      sgst: allTaxLines.length ? buckets.sgst : null,
      igst: allTaxLines.length ? buckets.igst : null,
      taxableAmount,
      totalRefunded: moneyAmount(node.totalRefundedSet),
      shippingProvince: node.shippingAddress?.province?.trim() || null,
      shippingCountry: node.shippingAddress?.countryCodeV2?.trim() || null,
      customerGstin: null,
      taxLines: allTaxLines,
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

  async fetchOrdersCount(query?: string | null): Promise<number | null> {
    assertServerOnly();
    try {
      const data = await this.graphql<OrdersCountQueryData>(ORDERS_COUNT_QUERY, {
        query: query?.trim() ? query.trim() : null,
      });
      const count = data.ordersCount?.count;
      return typeof count === "number" && Number.isFinite(count) ? count : null;
    } catch {
      // Progress total is best-effort — never block sync on count failures.
      return null;
    }
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
      // Keep pages small so sequential upserts finish inside Vercel’s ~60s limit.
      // Advancing the resume cursor only after upserts (service layer) + this size
      // avoids skipping half a page when a chunk times out mid-write.
      const pageSize = Math.max(10, Math.min(options.pageSize ?? 25, 50));
      const variables: {
        cursor: string | null;
        query: string | null;
        pageSize: number;
      } = {
        cursor,
        query: options.query?.trim() ? options.query.trim() : null,
        pageSize,
      };
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

  async fetchAbandonedCheckoutsPage(
    options: ShopifyFetchOptions = {},
  ): Promise<ShopifyAbandonedCheckoutPage> {
    assertServerOnly();
    const checkouts: ShopifyAbandonedCheckoutRecord[] = [];
    let cursor: string | null = options.cursor ?? null;
    let hasNext = true;
    let pages = 0;
    const maxPages = Math.max(1, Math.min(options.maxPages ?? 1, 10));

    while (hasNext && pages < maxPages) {
      pages += 1;
      const variables: { cursor: string | null; query: string | null } = {
        cursor,
        query: options.query?.trim() ? options.query.trim() : null,
      };
      const data: AbandonedCheckoutsQueryData = await this.graphql<AbandonedCheckoutsQueryData>(
        ABANDONED_CHECKOUTS_QUERY,
        variables,
      );
      for (const edge of data.abandonedCheckouts.edges) {
        checkouts.push(mapAbandonedCheckout(edge.node));
      }
      hasNext = data.abandonedCheckouts.pageInfo.hasNextPage;
      cursor = data.abandonedCheckouts.pageInfo.endCursor;
    }

    return {
      checkouts,
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
      query: options.query,
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
