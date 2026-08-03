import type { ShopifyConnector } from "@/lib/adapters/shopify/port";
import {
  classifyOrderValidity,
  computeLatestValidOrderDates,
} from "@/lib/adapters/shopify/normalize";
import {
  createLiveShopifyConnectorFromEnv,
} from "@/lib/adapters/shopify/live-graphql-connector";
import { createExternalCommerceRepository } from "@/lib/infra/repositories/postgres-external-commerce";
import type { ExternalCommerceRepository } from "@/lib/repositories/external-commerce";
import {
  emptyShopifySyncSummary,
  type CommerceCustomerDiagnostic,
  type ShopifySyncSummary,
} from "@/lib/domain/external-commerce-types";
import { ConfigurationError } from "@/lib/infra/db/errors";

export type SyncShopifyDeps = {
  connector?: ShopifyConnector;
  repo?: ExternalCommerceRepository;
  /** Resume cursor from a previous chunk */
  cursor?: string | null;
  /** Order pages per invocation (default 3 ≈ 150 orders) */
  maxPages?: number;
};

function resolveConnector(deps: SyncShopifyDeps): ShopifyConnector {
  if (deps.connector) return deps.connector;
  const live = createLiveShopifyConnectorFromEnv();
  if (!live) {
    throw new ConfigurationError(
      "Shopify credentials missing. Set SHOPIFY_STORE_DOMAIN plus SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (Dev Dashboard), or SHOPIFY_ADMIN_API_ACCESS_TOKEN.",
    );
  }
  return live;
}

function defaultMaxPages(): number {
  // Default 1 page (~25 orders) per invocation — safer under Vercel 60s limits.
  const raw = process.env.SHOPIFY_SYNC_MAX_PAGES?.trim();
  const n = raw ? Number(raw) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 10);
}

/**
 * Server-side Shopify → Aarla OS commerce sync for Customer Calls foundation.
 * Chunked for Vercel timeouts — pass `cursor` from the previous summary to continue.
 * Does not regenerate call queues or mutate interactions / contact preferences.
 */
export async function syncShopifyCustomerCallData(
  deps: SyncShopifyDeps = {},
): Promise<ShopifySyncSummary> {
  const summary = emptyShopifySyncSummary();
  const repo = deps.repo ?? createExternalCommerceRepository();
  const connector = resolveConnector(deps);
  const maxPages = deps.maxPages ?? defaultMaxPages();

  let payload;
  let hasMore = false;
  let nextCursor: string | null = null;
  let pagesFetched = 0;

  try {
    if (typeof connector.fetchCustomerCallPage === "function") {
      const page = await connector.fetchCustomerCallPage({
        cursor: deps.cursor ?? null,
        maxPages,
      });
      payload = { customers: page.customers, orders: page.orders };
      hasMore = page.hasMore;
      nextCursor = page.nextCursor;
      pagesFetched = page.pagesFetched;
    } else {
      payload = await connector.fetchCustomerCallPayload({
        cursor: deps.cursor ?? null,
        maxPages,
      });
      hasMore = false;
      nextCursor = null;
      pagesFetched = 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shopify fetch failed";
    summary.errors.push(message);
    summary.hasMore = false;
    summary.nextCursor = null;
    summary.pagesFetched = 0;
    summary.complete = false;
    return summary;
  }

  summary.customersRead = payload.customers.length;
  summary.ordersRead = payload.orders.length;
  summary.hasMore = hasMore;
  summary.nextCursor = nextCursor;
  summary.pagesFetched = pagesFetched;
  summary.complete = !hasMore;

  const customerExternalIds = new Set<string>();

  for (const customer of payload.customers) {
    try {
      const result = await repo.upsertCustomer({
        provider: "shopify",
        externalId: customer.externalId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        marketingConsentStatus: customer.marketingConsentStatus,
      });
      customerExternalIds.add(customer.externalId);
      if (result.created) summary.customersAdded += 1;
      else summary.customersUpdated += 1;
    } catch (err) {
      summary.recordsSkipped += 1;
      summary.errors.push(
        `Customer ${customer.externalId}: ${err instanceof Error ? err.message : "upsert failed"}`,
      );
    }
  }

  for (const order of payload.orders) {
    if (!order.externalCustomerId || customerExternalIds.has(order.externalCustomerId)) {
      continue;
    }
    try {
      const result = await repo.upsertCustomer({
        provider: "shopify",
        externalId: order.externalCustomerId,
        name: `Shopify customer ${order.externalCustomerId}`,
        phone: null,
        email: null,
        marketingConsentStatus: null,
      });
      customerExternalIds.add(order.externalCustomerId);
      summary.customersRead += 1;
      if (result.created) summary.customersAdded += 1;
      else summary.customersUpdated += 1;
    } catch (err) {
      summary.recordsSkipped += 1;
      summary.errors.push(
        `Order customer ${order.externalCustomerId}: ${
          err instanceof Error ? err.message : "upsert failed"
        }`,
      );
    }
  }

  const classified: Array<{
    externalCustomerId: string | null;
    orderDate: string;
    isValid: boolean;
  }> = [];

  for (const order of payload.orders) {
    const { isValid, exclusionReason } = classifyOrderValidity(order);
    classified.push({
      externalCustomerId: order.externalCustomerId,
      orderDate: order.orderDate,
      isValid,
    });

    try {
      const result = await repo.upsertOrder({
        provider: "shopify",
        externalId: order.externalId,
        orderNumber: order.orderNumber,
        externalCustomerExternalId: order.externalCustomerId,
        orderDate: order.orderDate,
        financialStatus: order.financialStatus,
        fulfilmentStatus: order.fulfilmentStatus,
        cancelledAt: order.cancelledAt,
        isTest: order.isTest,
        isValid,
        exclusionReason,
        totalAmount: order.totalAmount,
        currency: order.currency,
        lineItems: order.lineItems,
      });
      if (result.created) summary.ordersAdded += 1;
      else summary.ordersUpdated += 1;

      if (!isValid) {
        summary.recordsSkipped += 1;
      }

      for (const ful of order.fulfilments) {
        summary.fulfilmentsFound += 1;
        if (ful.trackingNumber) summary.awbsFound += 1;
        try {
          await repo.upsertFulfilment({
            provider: "shopify",
            externalId: ful.externalId,
            orderExternalId: order.externalId,
            trackingCompany: ful.trackingCompany,
            trackingNumber: ful.trackingNumber,
            trackingUrl: ful.trackingUrl,
            fulfilmentStatus: ful.fulfilmentStatus,
          });
        } catch (err) {
          summary.recordsSkipped += 1;
          summary.errors.push(
            `Fulfilment ${ful.externalId}: ${
              err instanceof Error ? err.message : "upsert failed"
            }`,
          );
        }
      }
    } catch (err) {
      summary.recordsSkipped += 1;
      summary.errors.push(
        `Order ${order.externalId}: ${err instanceof Error ? err.message : "upsert failed"}`,
      );
    }
  }

  const latest = computeLatestValidOrderDates(classified);
  for (const [externalId, latestAt] of latest) {
    try {
      const existing = await repo.findCustomerByExternalId("shopify", externalId);
      if (
        !existing?.latestValidOrderAt ||
        latestAt > existing.latestValidOrderAt
      ) {
        await repo.setLatestValidOrderAt("shopify", externalId, latestAt);
      }
    } catch (err) {
      summary.errors.push(
        `Latest order ${externalId}: ${err instanceof Error ? err.message : "update failed"}`,
      );
    }
  }

  return summary;
}

export async function getShopifyCommerceDiagnostics(
  deps: { repo?: ExternalCommerceRepository } = {},
): Promise<CommerceCustomerDiagnostic[]> {
  const repo = deps.repo ?? createExternalCommerceRepository();
  return repo.diagnostics();
}
