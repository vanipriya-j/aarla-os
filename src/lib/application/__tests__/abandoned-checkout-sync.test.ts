import { describe, expect, it } from "vitest";
import { syncShopifyAbandonedCheckouts } from "@/lib/application/abandoned-checkout-sync-service";
import { shopifyAbandonedCreatedAfterQuery } from "@/lib/application/commerce-sync-watermarks";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";
import type { ShopifyConnector } from "@/lib/adapters/shopify/port";
import type {
  ExternalCommerceRepository,
  UpsertAbandonedCheckoutInput,
} from "@/lib/repositories/external-commerce";

/**
 * Pure, DB-free stub — verifies sync orchestration logic without touching Postgres.
 * (Shared test DB is exercised separately by DB-gated integration suites.)
 */
function stubRepo(overrides: Partial<ExternalCommerceRepository> = {}): {
  repo: ExternalCommerceRepository;
  upserts: UpsertAbandonedCheckoutInput[];
  counters: { ensureCalls: number };
} {
  const upserts: UpsertAbandonedCheckoutInput[] = [];
  const counters = { ensureCalls: 0 };
  const repo = {
    findCustomerByExternalId: async () => null,
    upsertCustomer: async () => ({ id: "c1", created: true }),
    setLatestValidOrderAt: async () => undefined,
    upsertOrder: async () => ({ id: "o1", created: true }),
    upsertFulfilment: async () => ({ id: "f1", created: true }),
    ensureOrderContactPhoneSchema: async () => undefined,
    listDeliveredOrdersMissingPhone: async () => [],
    applyContactPhone: async () => ({ orderUpdated: false, customerUpdated: false }),
    listCustomers: async () => [],
    listOrdersForCustomer: async () => [],
    listItemsForOrder: async () => [],
    listFulfilmentsForOrder: async () => [],
    countOrdersByExternalId: async () => 0,
    countCustomers: async () => 0,
    diagnostics: async () => ({ rows: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }),
    countInteractionsForExternalCustomer: async () => 0,
    isDoNotContact: async () => false,
    ensureAbandonedCheckoutSchema: async () => {
      counters.ensureCalls += 1;
    },
    upsertAbandonedCheckout: async (input: UpsertAbandonedCheckoutInput) => {
      upserts.push(input);
      return { id: `checkout-${input.externalId}`, created: true };
    },
    ...overrides,
  } satisfies ExternalCommerceRepository;
  return { repo, upserts, counters };
}

describe("shopifyAbandonedCreatedAfterQuery", () => {
  it("builds a not_recovered Shopify search filter with overlap", () => {
    const q = shopifyAbandonedCreatedAfterQuery("2026-08-03T12:00:00.000Z");
    expect(q).toMatch(/^recovery_state:not_recovered created_at:>'/);
    expect(q).toContain("2026-08-03T11:58:00.000Z");
  });
});

describe("syncShopifyAbandonedCheckouts", () => {
  it("skips gracefully when the connector does not implement fetchAbandonedCheckoutsPage", async () => {
    const connector: ShopifyConnector = {
      provider: "shopify",
      async fetchCustomerCallPayload() {
        return { customers: [], orders: [] };
      },
    };
    const { repo, counters } = stubRepo();
    const summary = await syncShopifyAbandonedCheckouts({ connector, repo });
    expect(summary.errors.some((e) => e.includes("does not support"))).toBe(true);
    expect(summary.complete).toBe(true);
    expect(summary.checkoutsRead).toBe(0);
    expect(counters.ensureCalls).toBe(0);
  });

  it("upserts every fixture checkout and reports read/added counts", async () => {
    const connector = new FixtureShopifyConnector();
    const { repo, upserts, counters } = stubRepo();
    const summary = await syncShopifyAbandonedCheckouts({ connector, repo, mode: "full" });

    expect(counters.ensureCalls).toBe(1);
    expect(summary.checkoutsRead).toBe(3);
    expect(summary.checkoutsAdded).toBe(3);
    expect(summary.checkoutsUpdated).toBe(0);
    expect(summary.complete).toBe(true);
    expect(summary.mode).toBe("full");
    expect(upserts.map((u) => u.externalId).sort()).toEqual(["9001", "9002", "9003"]);

    const noPhone = upserts.find((u) => u.externalId === "9002");
    expect(noPhone?.phone).toBeNull();

    const completed = upserts.find((u) => u.externalId === "9003");
    expect(completed?.completedAt).toBe("2026-07-25T08:12:00.000Z");

    const eligible = upserts.find((u) => u.externalId === "9001");
    expect(eligible?.phone).toBeTruthy();
    expect(eligible?.completedAt).toBeNull();
  });

  it("records per-checkout upsert failures without aborting the run", async () => {
    const connector = new FixtureShopifyConnector();
    const { repo } = stubRepo({
      async upsertAbandonedCheckout(input) {
        if (input.externalId === "9002") {
          throw new Error("db write failed");
        }
        return { id: `checkout-${input.externalId}`, created: true };
      },
    });
    const summary = await syncShopifyAbandonedCheckouts({ connector, repo, mode: "full" });
    expect(summary.recordsSkipped).toBe(1);
    expect(summary.errors.some((e) => e.includes("9002"))).toBe(true);
    expect(summary.checkoutsAdded).toBe(2);
  });

  it("propagates connector fetch failures as an incomplete summary", async () => {
    const connector = new FixtureShopifyConnector({
      failHard: true,
      partialError: "Shopify Admin API unavailable",
    });
    const { repo } = stubRepo();
    const summary = await syncShopifyAbandonedCheckouts({ connector, repo, mode: "full" });
    expect(summary.complete).toBe(false);
    expect(summary.errors.some((e) => e.includes("unavailable"))).toBe(true);
  });
});
