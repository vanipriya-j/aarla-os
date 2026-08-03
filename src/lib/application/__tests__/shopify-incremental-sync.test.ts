import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query } from "@/lib/infra/db/pool";
import { ORG_ID } from "@/lib/infra/db/ids";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";
import { syncShopifyCustomerCallData } from "@/lib/application/shopify-sync-service";
import { createExternalCommerceRepository } from "@/lib/infra/repositories/postgres-external-commerce";
import {
  commitShopifyOrdersWatermark,
  getCommittedShopifyOrdersWatermark,
  getShopifyOrdersWatermark,
  noteShopifyOrdersSyncProgress,
  shopifyOrdersCreatedAfterQuery,
} from "@/lib/application/commerce-sync-watermarks";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("shopifyOrdersCreatedAfterQuery", () => {
  it("builds a Shopify search filter with overlap", () => {
    const q = shopifyOrdersCreatedAfterQuery("2026-08-03T12:00:00.000Z");
    expect(q).toMatch(/^created_at:>'/);
    expect(q).toContain("2026-08-03T11:58:00.000Z");
  });
});

describe.runIf(hasDb)("incremental Shopify watermark", () => {
  beforeAll(async () => {
    await query(`delete from commerce_sync_watermarks where organization_id = $1`, [
      ORG_ID,
    ]).catch(() => undefined);
  });

  afterAll(async () => {
    await closePool();
  });

  it("commits high-water only after the run completes", async () => {
    await query(`delete from commerce_sync_watermarks where organization_id = $1`, [
      ORG_ID,
    ]);

    await noteShopifyOrdersSyncProgress({
      runId: "run-1",
      maxOrderAt: "2026-07-01T00:00:00.000Z",
    });
    await noteShopifyOrdersSyncProgress({
      runId: "run-1",
      maxOrderAt: "2026-08-01T00:00:00.000Z",
    });
    expect(await getCommittedShopifyOrdersWatermark()).toBeNull();

    const committed = await commitShopifyOrdersWatermark("run-1");
    expect(committed).toBe("2026-08-01T00:00:00.000Z");
    expect(await getCommittedShopifyOrdersWatermark()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("incremental mode reads fewer fixture orders after watermark", async () => {
    await query(`delete from shipment_status_events where shipment_id in (
      select id from shipments where organization_id = $1
    )`, [ORG_ID]).catch(() => undefined);
    await query(`delete from shipments where organization_id = $1`, [ORG_ID]).catch(
      () => undefined,
    );
    await query(`delete from external_fulfilments where organization_id = $1`, [ORG_ID]);
    await query(`delete from external_order_items where external_order_id in (
      select id from external_orders where organization_id = $1
    )`, [ORG_ID]);
    await query(`delete from external_orders where organization_id = $1`, [ORG_ID]);
    await query(`delete from external_customers where organization_id = $1`, [ORG_ID]);
    await query(`delete from commerce_sync_watermarks where organization_id = $1`, [
      ORG_ID,
    ]);

    const repo = createExternalCommerceRepository();
    const connector = new FixtureShopifyConnector();

    const full = await syncShopifyCustomerCallData({
      connector,
      repo,
      mode: "full",
      runId: "full-run",
    });
    expect(full.ordersRead).toBeGreaterThan(0);
    expect(full.complete).toBe(true);

    const watermark = await getShopifyOrdersWatermark();
    expect(watermark).toBeTruthy();

    const incremental = await syncShopifyCustomerCallData({
      connector,
      repo,
      mode: "incremental",
      runId: "inc-run",
    });
    expect(incremental.mode).toBe("incremental");
    // 2-minute overlap may re-touch the newest order; nothing new should be inserted.
    expect(incremental.ordersAdded).toBe(0);
    expect(incremental.ordersRead).toBeLessThan(full.ordersRead);
    expect(incremental.complete).toBe(true);
  });
});
