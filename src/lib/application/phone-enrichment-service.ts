import type { ShopifyConnector } from "@/lib/adapters/shopify/port";
import { createLiveShopifyConnectorFromEnv } from "@/lib/adapters/shopify/live-graphql-connector";
import { createExternalCommerceRepository } from "@/lib/infra/repositories/postgres-external-commerce";
import type { ExternalCommerceRepository } from "@/lib/repositories/external-commerce";
import { ConfigurationError } from "@/lib/infra/db/errors";

export type PhoneEnrichSummary = {
  missingBefore: number;
  ordersFetched: number;
  phonesApplied: number;
  errors: string[];
};

function shopifyNameQuery(orderNumber: string): string {
  const trimmed = orderNumber.trim();
  if (!trimmed) return "";
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  // Quote so names with special chars stay exact.
  return `name:${JSON.stringify(withHash)}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Targeted Shopify phone backfill for delivered orders still missing a phone.
 * Fetches only those order names (batches of 10) — not the whole catalog.
 */
export async function enrichMissingDeliveryPhones(
  deps: {
    connector?: ShopifyConnector;
    repo?: ExternalCommerceRepository;
    limit?: number;
  } = {},
): Promise<PhoneEnrichSummary> {
  const summary: PhoneEnrichSummary = {
    missingBefore: 0,
    ordersFetched: 0,
    phonesApplied: 0,
    errors: [],
  };

  const repo = deps.repo ?? createExternalCommerceRepository();
  await repo.ensureOrderContactPhoneSchema();

  const missing = await repo.listDeliveredOrdersMissingPhone(deps.limit ?? 40);
  summary.missingBefore = missing.length;
  if (!missing.length) return summary;

  let connector = deps.connector;
  if (!connector) {
    const live = createLiveShopifyConnectorFromEnv();
    if (!live) {
      // Local/fixture environments — skip quietly; caller still regenerates queues.
      summary.errors.push(
        "Shopify credentials missing — skipped targeted phone backfill.",
      );
      return summary;
    }
    connector = live;
  }

  for (const batch of chunk(missing, 10)) {
    const query = batch
      .map((row) => shopifyNameQuery(row.orderNumber))
      .filter(Boolean)
      .join(" OR ");
    if (!query) continue;

    try {
      const page =
        typeof connector.fetchCustomerCallPage === "function"
          ? await connector.fetchCustomerCallPage({ query, maxPages: 1 })
          : {
              ...(await connector.fetchCustomerCallPayload({ query, maxPages: 1 })),
              hasMore: false,
              nextCursor: null,
              pagesFetched: 1,
            };

      summary.ordersFetched += page.orders.length;
      const phoneByCustomer = new Map(
        page.customers
          .filter((c) => c.phone?.trim())
          .map((c) => [c.externalId, c.phone!.trim()] as const),
      );

      for (const order of page.orders) {
        const phone =
          order.contactPhone?.trim() ||
          (order.externalCustomerId
            ? phoneByCustomer.get(order.externalCustomerId)
            : null) ||
          null;
        if (!phone) continue;

        const applied = await repo.applyContactPhone({
          provider: "shopify",
          orderExternalId: order.externalId,
          customerExternalId: order.externalCustomerId,
          phone,
        });
        if (applied.orderUpdated || applied.customerUpdated) {
          summary.phonesApplied += 1;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof ConfigurationError) {
        summary.errors.push(message);
        return summary;
      }
      summary.errors.push(`Phone backfill batch failed: ${message}`);
    }
  }

  return summary;
}
