import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";
import {
  getShopifyCommerceDiagnostics,
  syncShopifyCustomerCallData,
} from "@/lib/application/shopify-sync-service";
import { createExternalCommerceRepository } from "@/lib/infra/repositories/postgres-external-commerce";
import { createCustomerCallsRepository } from "@/lib/infra/repositories/postgres-customer-calls";
import { CustomerCallsEngine } from "@/lib/engine/customer-calls-engine";
import { closePool, query } from "@/lib/infra/db/pool";
import { ORG_ID } from "@/lib/infra/db/ids";
import type { ExternalCommerceRepository } from "@/lib/repositories/external-commerce";
import type { ShopifyConnector } from "@/lib/adapters/shopify/port";

const hasDb = Boolean(process.env.DATABASE_URL);

async function clearExternalCommerce() {
  await query(`delete from external_fulfilments where organization_id = $1`, [ORG_ID]);
  await query(`delete from external_order_items where external_order_id in (
    select id from external_orders where organization_id = $1
  )`, [ORG_ID]);
  await query(`delete from external_orders where organization_id = $1`, [ORG_ID]);
  await query(`delete from external_customers where organization_id = $1`, [ORG_ID]);
}

describe.runIf(hasDb)("Shopify customer-call commerce sync", () => {
  const repo = () => createExternalCommerceRepository();

  beforeAll(async () => {
    const tables = await query<{ exists: boolean }>(
      `select to_regclass('public.external_customers') is not null as exists`,
    );
    if (!tables[0]?.exists) {
      throw new Error("external_customers missing — run db:migrate");
    }
    await clearExternalCommerce();
  });

  afterAll(async () => {
    await closePool();
  });

  it("1. customers synchronize correctly", async () => {
    await clearExternalCommerce();
    const summary = await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: repo(),
    });
    expect(summary.customersRead).toBe(3);
    expect(summary.customersAdded).toBe(3);
    expect(await repo().countCustomers()).toBe(3);
    const ananya = await repo().findCustomerByExternalId("shopify", "1001");
    expect(ananya?.name).toBe("Ananya Sharma");
    expect(ananya?.phone).toContain("01001");
    expect(ananya?.email).toBe("ananya.fixture@aarla.test");
  });

  it("2. orders and line items synchronize correctly", async () => {
    await clearExternalCommerce();
    await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: repo(),
    });
    const customer = await repo().findCustomerByExternalId("shopify", "1001");
    expect(customer).toBeTruthy();
    const orders = await repo().listOrdersForCustomer(customer!.id);
    expect(orders.length).toBeGreaterThanOrEqual(2);
    const first = orders.find((o) => o.externalId === "5001");
    expect(first).toBeTruthy();
    const items = await repo().listItemsForOrder(first!.id);
    expect(items.map((i) => i.title).sort()).toEqual([
      "Ganapathi Magnet Set",
      "Lakshmi Brass Davara Tumbler",
    ]);
    expect(items.find((i) => i.title.includes("Tumbler"))?.quantity).toBe(1);
  });

  it("3. latest valid purchase date is calculated", async () => {
    await clearExternalCommerce();
    await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: repo(),
    });
    const ananya = await repo().findCustomerByExternalId("shopify", "1001");
    expect(ananya?.latestValidOrderAt).toBe("2026-07-28T14:30:00.000Z");
    const kavya = await repo().findCustomerByExternalId("shopify", "1003");
    // only invalid orders for Kavya in fixture
    expect(kavya?.latestValidOrderAt).toBeNull();
  });

  it("4. cancelled orders are flagged invalid", async () => {
    await clearExternalCommerce();
    await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: repo(),
    });
    const customer = await repo().findCustomerByExternalId("shopify", "1002");
    const orders = await repo().listOrdersForCustomer(customer!.id);
    const cancelled = orders.find((o) => o.externalId === "5004");
    expect(cancelled?.isValid).toBe(false);
    expect(cancelled?.exclusionReason).toBe("cancelled");
    expect(cancelled?.cancelledAt).toBeTruthy();
  });

  it("5. tracking company and AWB are captured", async () => {
    await clearExternalCommerce();
    await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: repo(),
    });
    const customer = await repo().findCustomerByExternalId("shopify", "1001");
    const orders = await repo().listOrdersForCustomer(customer!.id);
    const order = orders.find((o) => o.externalId === "5002")!;
    const fulfilments = await repo().listFulfilmentsForOrder(order.id);
    expect(fulfilments.length).toBe(1);
    expect(fulfilments[0]?.trackingCompany).toBe("Delhivery");
    expect(fulfilments[0]?.trackingNumber).toBe("AWB1002DEL");
    expect(fulfilments[0]?.trackingUrl).toContain("AWB1002DEL");
  });

  it("6. repeated sync does not duplicate records", async () => {
    await clearExternalCommerce();
    const connector = new FixtureShopifyConnector();
    const first = await syncShopifyCustomerCallData({ connector, repo: repo() });
    const second = await syncShopifyCustomerCallData({ connector, repo: repo() });
    expect(first.customersAdded).toBe(3);
    expect(second.customersAdded).toBe(0);
    expect(second.customersUpdated).toBe(3);
    expect(second.ordersAdded).toBe(0);
    expect(second.ordersUpdated).toBeGreaterThan(0);
    expect(await repo().countCustomers()).toBe(3);
    expect(await repo().countOrdersByExternalId("shopify", "5001")).toBe(1);
  });

  it("7. existing call interactions remain intact", async () => {
    await clearExternalCommerce();
    const engine = new CustomerCallsEngine(createCustomerCallsRepository());
    const ws = await engine.getWorkspace("delivery-follow-up");
    const item = ws.queue.find((q) => q.status === "pending" || q.status === "in-progress");
    expect(item).toBeTruthy();
    await engine.startCall(item!.id);
    const saved = await engine.saveOutcome({
      queueItemId: item!.id,
      outcome: "Happy",
      notes: "Pre-sync interaction must survive",
    });
    const before = await repo().countInteractionsForExternalCustomer(item!.externalCustomerId);
    expect(before).toBeGreaterThanOrEqual(1);

    await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: repo(),
    });

    const after = await repo().countInteractionsForExternalCustomer(item!.externalCustomerId);
    expect(after).toBe(before);
    const history = await engine.history(item!.externalCustomerId);
    expect(history.some((h) => h.id === saved.interaction.id)).toBe(true);
  });

  it("8. existing do-not-contact preferences remain intact", async () => {
    await clearExternalCommerce();
    const calls = createCustomerCallsRepository();
    const engine = new CustomerCallsEngine(calls);
    const ws = await engine.getWorkspace("re-engagement");
    const item = ws.queue.find((q) => q.status === "pending");
    expect(item).toBeTruthy();
    await engine.startCall(item!.id);
    await engine.saveOutcome({
      queueItemId: item!.id,
      outcome: "Do Not Contact",
      notes: "Asked not to be called",
    });
    expect(await repo().isDoNotContact(item!.externalCustomerId)).toBe(true);

    await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: repo(),
    });

    expect(await repo().isDoNotContact(item!.externalCustomerId)).toBe(true);
  });

  it("9. partial Shopify failures are reported safely", async () => {
    await clearExternalCommerce();
    const hard = await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector({
        failHard: true,
        partialError: "Shopify Admin API unavailable",
      }),
      repo: repo(),
    });
    expect(hard.errors.some((e) => e.includes("unavailable"))).toBe(true);
    expect(hard.customersAdded).toBe(0);

    const base = new FixtureShopifyConnector();
    const failingRepo: ExternalCommerceRepository = {
      ...repo(),
      async upsertFulfilment(input) {
        if (input.externalId === "ful-5001") {
          throw new Error("transient fulfilment write failure");
        }
        return repo().upsertFulfilment(input);
      },
    };

    const partial = await syncShopifyCustomerCallData({
      connector: base,
      repo: failingRepo,
    });
    expect(partial.errors.some((e) => e.includes("fulfilment write failure"))).toBe(true);
    expect(partial.customersAdded).toBeGreaterThan(0);
    // No tokens or full customer dumps in errors
    for (const err of partial.errors) {
      expect(err).not.toMatch(/shpat_/i);
      expect(err).not.toMatch(/ananya\.fixture@aarla\.test/i);
    }
  });

  it("diagnostics mask personal data and expose AWB availability", async () => {
    await clearExternalCommerce();
    await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: repo(),
    });
    const rows = await getShopifyCommerceDiagnostics({ repo: repo() });
    const ananya = rows.find((r) => r.externalId === "1001");
    expect(ananya).toBeTruthy();
    expect(ananya?.phoneMasked).toMatch(/1001$/);
    expect(ananya?.emailMasked).toBe("••••@aarla.test");
    expect(ananya?.awbAvailable).toBe(true);
    expect(ananya?.carriers).toContain("Delhivery");
    expect(JSON.stringify(rows)).not.toContain("ananya.fixture@aarla.test");
  });
});

describe("Shopify credential boundary", () => {
  it("10. no Shopify credential reaches browser-bound modules", () => {
    const roots = [
      path.resolve("src/components"),
      path.resolve("src/app/customer-calls"),
      path.resolve("src/lib/client"),
    ];
    const banned = [
      "SHOPIFY_ADMIN_API_ACCESS_TOKEN",
      "SHOPIFY_CLIENT_SECRET",
      "live-graphql-connector",
      "LiveShopifyGraphqlConnector",
      "createLiveShopifyConnectorFromEnv",
      "X-Shopify-Access-Token",
      "resolveShopifyAccessToken",
    ];

    function walk(dir: string, files: string[] = []): string[] {
      if (!statSync(dir, { throwIfNoEntry: false })) return files;
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, files);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry)) files.push(full);
      }
      return files;
    }

    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        for (const token of banned) {
          if (text.includes(token)) {
            offenders.push(`${file}: ${token}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);

    // Client page may import the sync panel, but panel must only call server actions.
    const panel = readFileSync(
      path.resolve("src/components/customer-calls/ShopifySyncPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("shopify-sync-actions");
    expect(panel).not.toContain("process.env.SHOPIFY");
  });

  it("live connector refuses browser execution", async () => {
    const { LiveShopifyGraphqlConnector } = await import(
      "@/lib/adapters/shopify/live-graphql-connector"
    );
    const prev = globalThis.window;
    // Simulate browser global briefly.
    // @ts-expect-error test shim
    globalThis.window = {};
    try {
      expect(() => {
        new LiveShopifyGraphqlConnector({
          storeDomain: "example.myshopify.com",
          adminApiAccessToken: "shpat_test",
          apiVersion: "2025-01",
        });
      }).toThrow(/must not run in the browser/i);
    } finally {
      // @ts-expect-error restore
      globalThis.window = prev;
    }
  });

  it("fixture connector never needs live credentials", async () => {
    const connector: ShopifyConnector = new FixtureShopifyConnector();
    const payload = await connector.fetchCustomerCallPayload();
    expect(payload.customers.length).toBeGreaterThan(0);
    expect(payload.orders.length).toBeGreaterThan(0);
  });
});
