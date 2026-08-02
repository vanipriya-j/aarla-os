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
};

function resolveConnector(deps: SyncShopifyDeps): ShopifyConnector {
  if (deps.connector) return deps.connector;
  const live = createLiveShopifyConnectorFromEnv();
  if (!live) {
    throw new ConfigurationError(
      "Shopify credentials missing. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_ACCESS_TOKEN on the server.",
    );
  }
  return live;
}

/**
 * Server-side Shopify → Aarla OS commerce sync for Customer Calls foundation.
 * Does not regenerate call queues or mutate interactions / contact preferences.
 */
export async function syncShopifyCustomerCallData(
  deps: SyncShopifyDeps = {},
): Promise<ShopifySyncSummary> {
  const summary = emptyShopifySyncSummary();
  const repo = deps.repo ?? createExternalCommerceRepository();
  const connector = resolveConnector(deps);

  let payload;
  try {
    payload = await connector.fetchCustomerCallPayload();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shopify fetch failed";
    summary.errors.push(message);
    return summary;
  }

  summary.customersRead = payload.customers.length;
  summary.ordersRead = payload.orders.length;

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

  // Ensure customers referenced only on orders exist before order upserts.
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
      await repo.setLatestValidOrderAt("shopify", externalId, latestAt);
    } catch (err) {
      summary.errors.push(
        `Latest order ${externalId}: ${err instanceof Error ? err.message : "update failed"}`,
      );
    }
  }

  // Clear latest for customers with no valid orders after this sync.
  for (const customer of payload.customers) {
    if (!latest.has(customer.externalId)) {
      try {
        await repo.setLatestValidOrderAt("shopify", customer.externalId, null);
      } catch {
        /* ignore */
      }
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
