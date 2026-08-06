import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixtureDelhiveryConnector } from "@/lib/adapters/delhivery/fixture-connector";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";
import { generateCustomerCallQueues } from "@/lib/application/call-queue-generation-service";
import { syncDelhiveryShipments } from "@/lib/application/delhivery-sync-service";
import { syncShopifyCustomerCallData } from "@/lib/application/shopify-sync-service";
import {
  daysSince,
  deliveryFollowUpReason,
  deliveryQueueSourceKey,
  reengagementQueueSourceKey,
} from "@/lib/domain/customer-calls-types";
import { ORG_ID } from "@/lib/infra/db/ids";
import { closePool, query } from "@/lib/infra/db/pool";
import { createCustomerCallsRepository } from "@/lib/infra/repositories/postgres-customer-calls";
import { createExternalCommerceRepository } from "@/lib/infra/repositories/postgres-external-commerce";
import { createShipmentRepository } from "@/lib/infra/repositories/postgres-shipments";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("call queue helpers", () => {
  it("formats delivery reason by age", () => {
    const now = new Date("2026-08-06T12:00:00.000Z");
    expect(deliveryFollowUpReason("2026-08-06T08:00:00.000Z", now)).toMatch(/today/i);
    expect(deliveryFollowUpReason("2026-08-05T08:00:00.000Z", now)).toMatch(/yesterday/i);
    expect(deliveryFollowUpReason("2026-08-01T08:00:00.000Z", now)).toBe(
      "Order delivered 5 days ago — check experience",
    );
    expect(daysSince("2026-07-22T12:18:25.000Z", now)).toBe(14);
  });

  it("builds stable source keys", () => {
    expect(deliveryQueueSourceKey("1001", "#10450")).toBe("delivery:1001:#10450");
    expect(reengagementQueueSourceKey("1002")).toBe("reeng:1002");
  });
});

describe.runIf(hasDb)("live call queue generation", () => {
  const calls = () => createCustomerCallsRepository();

  async function clearCommerceAndShipments() {
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
  }

  async function clearLiveQueueRows() {
    await query(
      `delete from customer_interactions where organization_id = $1
         and queue_item_id in (
           select id from customer_call_queue_items
           where organization_id = $1 and source_key not like 'seed:%'
         )`,
      [ORG_ID],
    );
    await query(
      `delete from customer_call_queue_items
       where organization_id = $1 and source_key not like 'seed:%'`,
      [ORG_ID],
    );
  }

  beforeAll(async () => {
    const tables = await query<{ exists: boolean }>(
      `select to_regclass('public.customer_call_queue_items') is not null as exists`,
    );
    if (!tables[0]?.exists) {
      throw new Error("customer_call_queue_items missing — run db:migrate");
    }
    // Ensure source_key column exists (migration may need applying in this env).
    await query(`
      alter table customer_call_queue_items add column if not exists source_key text;
      update customer_call_queue_items
      set source_key = 'legacy:' || id::text
      where source_key is null;
      alter table customer_call_queue_items alter column source_key set not null;
      create unique index if not exists customer_call_queue_source_key_uidx
        on customer_call_queue_items (organization_id, segment_id, source_key);
    `);
    await clearCommerceAndShipments();
    await clearLiveQueueRows();
  });

  afterAll(async () => {
    await closePool();
  });

  it("builds delivery follow-up from Delhivery delivered shipments", async () => {
    await clearCommerceAndShipments();
    await clearLiveQueueRows();
    await syncShopifyCustomerCallData({
      connector: new FixtureShopifyConnector(),
      repo: createExternalCommerceRepository(),
    });
    await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector(),
      repo: createShipmentRepository(),
    });

    const summary = await generateCustomerCallQueues({
      repo: calls(),
      now: new Date("2026-08-06T12:00:00.000Z"),
      deliveryLookbackDays: 45,
    });

    expect(summary.deliveryCandidates).toBeGreaterThanOrEqual(1);
    expect(summary.deliveryCreated + summary.deliveryUpdated).toBeGreaterThanOrEqual(1);

    const ws = await calls().getSegmentByType("delivery-follow-up");
    expect(ws).toBeTruthy();
    const queue = await calls().listQueue(ws!.id, true);
    const live = queue.filter((q) => q.externalCustomerId === "1001");
    expect(live.length).toBeGreaterThanOrEqual(1);
    expect(live[0]?.externalOrderId).toMatch(/#10450|#DEL/);
    expect(live[0]?.deliveredAt).toBeTruthy();
    expect(live[0]?.phone).toBeTruthy();
  });

  it("builds re-engagement for customers with old latest valid order", async () => {
    await clearCommerceAndShipments();
    await clearLiveQueueRows();

    await query(
      `insert into external_customers (
         id, organization_id, provider, external_id, name, phone, email,
         latest_valid_order_at, last_synced_at
       ) values (
         gen_random_uuid(), $1, 'shopify', '9001', 'Lapsed Buyer',
         '+91 90000 09001', 'lapsed@aarla.test',
         '2026-03-01T10:00:00Z', now()
       )
       on conflict (organization_id, provider, external_id) do update set
         latest_valid_order_at = excluded.latest_valid_order_at,
         phone = excluded.phone,
         name = excluded.name`,
      [ORG_ID],
    );
    const cust = await query<{ id: string }>(
      `select id from external_customers
       where organization_id = $1 and external_id = '9001'`,
      [ORG_ID],
    );
    await query(
      `insert into external_orders (
         id, organization_id, provider, external_id, order_number, external_customer_id,
         order_date, financial_status, fulfilment_status, is_valid, total_amount, currency, last_synced_at
       ) values (
         gen_random_uuid(), $1, 'shopify', 'ord-9001', '#9001', $2,
         '2026-03-01T10:00:00Z', 'PAID', 'FULFILLED', true, 1000, 'INR', now()
       )
       on conflict (organization_id, provider, external_id) do update set
         order_date = excluded.order_date,
         is_valid = true`,
      [ORG_ID, cust[0].id],
    );

    const summary = await generateCustomerCallQueues({
      repo: calls(),
      now: new Date("2026-08-06T12:00:00.000Z"),
    });
    expect(summary.reengagementCandidates).toBeGreaterThanOrEqual(1);

    const seg = await calls().getSegmentByType("re-engagement");
    const queue = await calls().listQueue(seg!.id, true);
    expect(queue.some((q) => q.externalCustomerId === "9001")).toBe(true);
  });

  it("does not retire seeded pending when there are no live candidates", async () => {
    await clearCommerceAndShipments();
    await clearLiveQueueRows();
    const before = await query<{ n: string }>(
      `select count(*)::text as n from customer_call_queue_items
       where organization_id = $1 and status = 'pending'
         and source_key like 'seed:%'`,
      [ORG_ID],
    );
    const seedPending = Number(before[0]?.n ?? 0);
    // If seed was never applied in this DB, skip assertion.
    if (seedPending === 0) return;

    const summary = await generateCustomerCallQueues({ repo: calls() });
    expect(summary.deliveryCandidates).toBe(0);
    expect(summary.deliveryRetired).toBe(0);

    const after = await query<{ n: string }>(
      `select count(*)::text as n from customer_call_queue_items
       where organization_id = $1 and status = 'pending'
         and source_key like 'seed:%'`,
      [ORG_ID],
    );
    expect(Number(after[0]?.n ?? 0)).toBe(seedPending);
  });
});
