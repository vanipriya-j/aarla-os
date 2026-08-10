import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixtureDelhiveryConnector } from "@/lib/adapters/delhivery/fixture-connector";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";
import { generateCustomerCallQueues } from "@/lib/application/call-queue-generation-service";
import { syncDelhiveryShipments } from "@/lib/application/delhivery-sync-service";
import { syncShopifyCustomerCallData } from "@/lib/application/shopify-sync-service";
import {
  abandonedCartQueueSourceKey,
  abandonedCartReason,
} from "@/lib/domain/customer-calls-types";
import { CustomerCallsEngine } from "@/lib/engine/customer-calls-engine";
import { ORG_ID } from "@/lib/infra/db/ids";
import { closePool, query, withTransaction } from "@/lib/infra/db/pool";
import { seedDemoCallQueuesForTests } from "@/lib/infra/db/seed-customer-calls";
import { createCustomerCallsRepository } from "@/lib/infra/repositories/postgres-customer-calls";
import { createExternalCommerceRepository } from "@/lib/infra/repositories/postgres-external-commerce";
import { createShipmentRepository } from "@/lib/infra/repositories/postgres-shipments";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("abandoned cart queue helpers", () => {
  it("builds stable source keys", () => {
    expect(abandonedCartQueueSourceKey("checkout-123")).toBe("abandoned:checkout-123");
    expect(abandonedCartQueueSourceKey("9001")).toBe("abandoned:9001");
  });

  it("formats reason by age", () => {
    const now = new Date("2026-08-06T12:00:00.000Z");
    expect(abandonedCartReason("2026-08-06T08:00:00.000Z", now)).toMatch(/today/i);
    expect(abandonedCartReason("2026-08-05T08:00:00.000Z", now)).toMatch(/yesterday/i);
    expect(abandonedCartReason("2026-08-01T08:00:00.000Z", now)).toBe(
      "Abandoned checkout 5 days ago",
    );
  });
});

describe.runIf(hasDb)("live abandoned-cart queue generation", () => {
  const NOW = new Date("2026-08-06T12:00:00.000Z");
  const calls = () => createCustomerCallsRepository();
  const engine = () => new CustomerCallsEngine(createCustomerCallsRepository());

  type CheckoutInput = {
    externalId: string;
    externalCustomerId?: string | null;
    customerName?: string;
    phone?: string | null;
    email?: string | null;
    checkoutUrl?: string | null;
    subtotal?: number;
    currency?: string;
    lastActivityAt?: string;
    completedAt?: string | null;
    convertedOrderExternalId?: string | null;
    items?: Array<{ title: string; quantity: number; unitPrice: number }>;
  };

  async function insertCheckout(opts: CheckoutInput): Promise<string> {
    const rows = await query<{ id: string }>(
      `insert into external_abandoned_checkouts (
         id, organization_id, provider, external_id, external_customer_id, customer_name, phone,
         email, checkout_url, subtotal, currency, last_activity_at, completed_at,
         converted_order_external_id, shopify_created_at
       ) values (
         gen_random_uuid(), $1, 'shopify', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $10
       )
       on conflict (organization_id, provider, external_id) do update set
         external_customer_id = excluded.external_customer_id,
         customer_name = excluded.customer_name,
         phone = excluded.phone,
         email = excluded.email,
         checkout_url = excluded.checkout_url,
         subtotal = excluded.subtotal,
         currency = excluded.currency,
         last_activity_at = excluded.last_activity_at,
         completed_at = excluded.completed_at,
         converted_order_external_id = excluded.converted_order_external_id
       returning id`,
      [
        ORG_ID,
        opts.externalId,
        opts.externalCustomerId ?? null,
        opts.customerName ?? "Test Customer",
        opts.phone ?? null,
        opts.email ?? null,
        opts.checkoutUrl ?? null,
        opts.subtotal ?? 999,
        opts.currency ?? "INR",
        opts.lastActivityAt ?? NOW.toISOString(),
        opts.completedAt ?? null,
        opts.convertedOrderExternalId ?? null,
      ],
    );
    const checkoutId = rows[0]!.id;
    for (const [idx, item] of (opts.items ?? []).entries()) {
      await query(
        `insert into external_abandoned_checkout_items (
           id, checkout_id, external_line_item_id, title, quantity, unit_price
         ) values (gen_random_uuid(), $1, $2, $3, $4, $5)
         on conflict (checkout_id, external_line_item_id) do nothing`,
        [checkoutId, `li-${idx}`, item.title, item.quantity, item.unitPrice],
      );
    }
    return checkoutId;
  }

  async function insertCustomerWithValidOrder(opts: {
    externalCustomerId: string;
    externalOrderId: string;
    phone?: string | null;
    email?: string | null;
    orderDate: string;
  }): Promise<void> {
    await query(
      `insert into external_customers (
         id, organization_id, provider, external_id, name, phone, email,
         latest_valid_order_at, last_synced_at
       ) values (
         gen_random_uuid(), $1, 'shopify', $2, 'Due Diligence Customer', $3, $4, $5, now()
       )
       on conflict (organization_id, provider, external_id) do update set
         phone = excluded.phone,
         email = excluded.email,
         latest_valid_order_at = excluded.latest_valid_order_at`,
      [ORG_ID, opts.externalCustomerId, opts.phone ?? null, opts.email ?? null, opts.orderDate],
    );
    const cust = await query<{ id: string }>(
      `select id from external_customers
       where organization_id = $1 and provider = 'shopify' and external_id = $2`,
      [ORG_ID, opts.externalCustomerId],
    );
    await query(
      `insert into external_orders (
         id, organization_id, provider, external_id, order_number, external_customer_id,
         order_date, financial_status, fulfilment_status, is_valid, total_amount, currency,
         last_synced_at
       ) values (
         gen_random_uuid(), $1, 'shopify', $2, $2, $3, $4, 'PAID', 'FULFILLED', true, 500, 'INR', now()
       )
       on conflict (organization_id, provider, external_id) do update set
         order_date = excluded.order_date,
         is_valid = true`,
      [ORG_ID, opts.externalOrderId, cust[0]!.id, opts.orderDate],
    );
  }

  async function clearAbandonedTestData() {
    await query(
      `delete from external_abandoned_checkout_items where checkout_id in (
         select id from external_abandoned_checkouts
         where organization_id = $1 and external_id like 'ac-test-%'
       )`,
      [ORG_ID],
    );
    await query(
      `delete from external_abandoned_checkouts
       where organization_id = $1 and external_id like 'ac-test-%'`,
      [ORG_ID],
    );
    await query(
      `delete from customer_interactions
       where organization_id = $1 and queue_item_id in (
         select id from customer_call_queue_items
         where organization_id = $1 and source_key like 'abandoned:ac-test-%'
       )`,
      [ORG_ID],
    );
    await query(
      `delete from customer_call_queue_items
       where organization_id = $1 and source_key like 'abandoned:ac-test-%'`,
      [ORG_ID],
    );
    await query(
      `delete from customer_contact_preferences
       where organization_id = $1 and external_customer_id like 'ac-test-%'`,
      [ORG_ID],
    );
    await query(
      `delete from external_orders
       where organization_id = $1 and provider = 'shopify' and external_id like 'ac-order-%'`,
      [ORG_ID],
    );
    await query(
      `delete from external_customers
       where organization_id = $1 and provider = 'shopify' and external_id like 'ac-cust-%'`,
      [ORG_ID],
    );
  }

  async function generate(overrides: Parameters<typeof generateCustomerCallQueues>[0] = {}) {
    return generateCustomerCallQueues({
      repo: calls(),
      now: NOW,
      skipPhoneEnrichment: true,
      ...overrides,
    });
  }

  beforeAll(async () => {
    await withTransaction(async (client) => {
      await seedDemoCallQueuesForTests(client);
    });
    await calls().ensureAbandonedCartSchema();
  });

  beforeEach(async () => {
    await clearAbandonedTestData();
  });

  afterAll(async () => {
    await clearAbandonedTestData();
    await closePool();
  });

  it("enters a valid abandoned checkout into the queue", async () => {
    await insertCheckout({
      externalId: "ac-test-1",
      externalCustomerId: "ac-cust-1",
      customerName: "Priya Valid",
      phone: "+91 90000 00001",
      email: "priya@aarla.test",
      checkoutUrl: "https://aarla-store.myshopify.com/checkout/ac-test-1",
      subtotal: 1250,
      currency: "INR",
      lastActivityAt: "2026-08-05T10:00:00Z",
      items: [{ title: "Lakshmi Brass Davara Tumbler", quantity: 1, unitPrice: 1250 }],
    });

    const summary = await generate();
    expect(summary.abandonedCartCandidates).toBeGreaterThanOrEqual(1);
    expect(summary.abandonedCartCreated).toBeGreaterThanOrEqual(1);

    const seg = await calls().getSegmentByType("abandoned-cart");
    expect(seg).toBeTruthy();
    const queue = await calls().listQueue(seg!.id, true);
    const row = queue.find((q) => q.externalCustomerId === "ac-cust-1");
    expect(row).toBeTruthy();
    expect(row?.checkoutUrl).toBe("https://aarla-store.myshopify.com/checkout/ac-test-1");
    expect(row?.cartSubtotal).toBe(1250);
    expect(row?.cartCurrency).toBe("INR");
    expect(row?.productsSummary).toMatch(/Lakshmi Brass Davara Tumbler/);
  });

  it("excludes checkouts already converted (completed_at or converted_order_external_id)", async () => {
    await insertCheckout({
      externalId: "ac-test-completed",
      externalCustomerId: "ac-cust-completed",
      phone: "+91 90000 00002",
      lastActivityAt: "2026-08-05T10:00:00Z",
      completedAt: "2026-08-05T11:00:00Z",
    });
    await insertCheckout({
      externalId: "ac-test-converted",
      externalCustomerId: "ac-cust-converted",
      phone: "+91 90000 00003",
      lastActivityAt: "2026-08-05T10:00:00Z",
      convertedOrderExternalId: "shopify-order-999",
    });

    const candidates = await calls().listAbandonedCartCandidates(7);
    expect(candidates.some((c) => c.externalCheckoutId === "ac-test-completed")).toBe(false);
    expect(candidates.some((c) => c.externalCheckoutId === "ac-test-converted")).toBe(false);
  });

  it("excludes checkouts without a phone number", async () => {
    await insertCheckout({
      externalId: "ac-test-no-phone",
      externalCustomerId: "ac-cust-no-phone",
      phone: null,
      lastActivityAt: "2026-08-05T10:00:00Z",
    });

    const candidates = await calls().listAbandonedCartCandidates(7);
    expect(candidates.some((c) => c.externalCheckoutId === "ac-test-no-phone")).toBe(false);
  });

  it("excludes Do Not Contact customers", async () => {
    await insertCheckout({
      externalId: "ac-test-dnc",
      externalCustomerId: "ac-cust-dnc",
      phone: "+91 90000 00004",
      lastActivityAt: "2026-08-05T10:00:00Z",
    });
    await calls().upsertDoNotContact("ac-cust-dnc", "Asked not to be called");

    const candidates = await calls().listAbandonedCartCandidates(7);
    expect(candidates.some((c) => c.externalCheckoutId === "ac-test-dnc")).toBe(false);
  });

  it("does not recreate a queue row once its abandoned-cart interaction is completed", async () => {
    await insertCheckout({
      externalId: "ac-test-done",
      externalCustomerId: "ac-cust-done",
      phone: "+91 90000 00005",
      lastActivityAt: "2026-08-05T10:00:00Z",
    });

    await generate();
    const seg = await calls().getSegmentByType("abandoned-cart");
    let queue = await calls().listQueue(seg!.id, true);
    const row = queue.find((q) => q.externalCustomerId === "ac-cust-done");
    expect(row).toBeTruthy();

    await engine().startCall(row!.id);
    await engine().saveOutcome({ queueItemId: row!.id, outcome: "Not Interested" });

    const candidates = await calls().listAbandonedCartCandidates(7);
    expect(candidates.some((c) => c.externalCheckoutId === "ac-test-done")).toBe(false);

    // Refresh must not resurrect it or touch its completed status.
    await generate();
    queue = await calls().listQueue(seg!.id, false);
    const after = queue.find((q) => q.externalCustomerId === "ac-cust-done");
    expect(after?.status).toBe("completed");
    expect(queue.filter((q) => q.externalCustomerId === "ac-cust-done")).toHaveLength(1);
  });

  it("does not duplicate rows across repeated generate() calls", async () => {
    await insertCheckout({
      externalId: "ac-test-repeat",
      externalCustomerId: "ac-cust-repeat",
      phone: "+91 90000 00006",
      lastActivityAt: "2026-08-05T10:00:00Z",
    });

    await generate();
    await generate();
    await generate();

    const rows = await query<{ n: string }>(
      `select count(*)::text as n from customer_call_queue_items
       where organization_id = $1 and source_key = $2`,
      [ORG_ID, abandonedCartQueueSourceKey("ac-test-repeat")],
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(1);
  });

  it("keeps a Call Later row call-later across refresh", async () => {
    await insertCheckout({
      externalId: "ac-test-call-later",
      externalCustomerId: "ac-cust-call-later",
      phone: "+91 90000 00007",
      lastActivityAt: "2026-08-05T10:00:00Z",
    });

    await generate();
    const seg = await calls().getSegmentByType("abandoned-cart");
    const queue = await calls().listQueue(seg!.id, true);
    const row = queue.find((q) => q.externalCustomerId === "ac-cust-call-later");
    expect(row).toBeTruthy();

    await engine().startCall(row!.id);
    const saved = await engine().callLater(row!.id, "2026-08-10", "Try again later");
    expect(saved.item.status).toBe("call-later");

    await generate();
    const after = await calls().getQueueItem(row!.id);
    expect(after?.status).toBe("call-later");
  });

  it("closes the queue and marks the checkout converted on Already Purchased", async () => {
    await insertCheckout({
      externalId: "ac-test-purchased",
      externalCustomerId: "ac-cust-purchased",
      phone: "+91 90000 00008",
      lastActivityAt: "2026-08-05T10:00:00Z",
    });

    await generate();
    const seg = await calls().getSegmentByType("abandoned-cart");
    const queue = await calls().listQueue(seg!.id, true);
    const row = queue.find((q) => q.externalCustomerId === "ac-cust-purchased");
    expect(row).toBeTruthy();
    expect(row?.sourceKey).toBe(abandonedCartQueueSourceKey("ac-test-purchased"));

    await engine().startCall(row!.id);
    const saved = await engine().saveOutcome({
      queueItemId: row!.id,
      outcome: "Already Purchased",
      linkedOrderExternalId: "#10452",
    });
    expect(saved.item.status).toBe("completed");

    const checkout = await query<{ converted_order_external_id: string | null }>(
      `select converted_order_external_id from external_abandoned_checkouts
       where organization_id = $1 and provider = 'shopify' and external_id = $2`,
      [ORG_ID, "ac-test-purchased"],
    );
    expect(checkout[0]?.converted_order_external_id).toBe("#10452");
  });

  it("excludes checkouts whose customer has a valid order in the lookback window (due diligence)", async () => {
    await insertCustomerWithValidOrder({
      externalCustomerId: "ac-cust-dd",
      externalOrderId: "ac-order-dd",
      phone: "+91 90000 00009",
      orderDate: "2026-08-04T09:00:00Z",
    });
    await insertCheckout({
      externalId: "ac-test-dd",
      externalCustomerId: null,
      phone: "+91 90000 00009",
      lastActivityAt: "2026-08-05T10:00:00Z",
    });

    const candidates = await calls().listAbandonedCartCandidates(7);
    expect(candidates.some((c) => c.externalCheckoutId === "ac-test-dd")).toBe(false);
  });

  it("still builds delivery follow-up alongside abandoned-cart generation", async () => {
    // Clear commerce/shipment rows first — the demo seed (seed-delhivery-demo.ts) reuses
    // the same AWBs as the fixture connector, which makes tracking-number linkage
    // ambiguous once both datasets exist for the same org. Starting from a clean slate
    // matches how the fixture connectors are meant to be exercised in isolation.
    await query(
      `delete from shipment_status_events where shipment_id in (
        select id from shipments where organization_id = $1
      )`,
      [ORG_ID],
    );
    await query(`delete from shipments where organization_id = $1`, [ORG_ID]);
    await query(`delete from external_fulfilments where organization_id = $1`, [ORG_ID]);
    await query(
      `delete from external_order_items where external_order_id in (
        select id from external_orders where organization_id = $1
      )`,
      [ORG_ID],
    );
    await query(`delete from external_orders where organization_id = $1`, [ORG_ID]);
    await query(`delete from external_customers where organization_id = $1`, [ORG_ID]);

    // Full re-sync — bypasses incremental watermarks that earlier suites may have advanced.
    await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: createExternalCommerceRepository(),
      mode: "full",
    });
    await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector(),
      repo: createShipmentRepository(),
    });

    const summary = await generate({ deliveryLookbackDays: 120 });
    expect(summary.deliveryCandidates).toBeGreaterThanOrEqual(1);
    expect(summary.abandonedCartCandidates).toBeGreaterThanOrEqual(0);
  });
});
