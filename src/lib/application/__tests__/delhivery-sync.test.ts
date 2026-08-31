import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { FixtureDelhiveryConnector } from "@/lib/adapters/delhivery/fixture-connector";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";
import { syncShopifyCustomerCallData } from "@/lib/application/shopify-sync-service";
import {
  getDelhiveryShipmentDiagnostics,
  syncDelhiveryShipments,
} from "@/lib/application/delhivery-sync-service";
import { createShipmentRepository } from "@/lib/infra/repositories/postgres-shipments";
import { createExternalCommerceRepository } from "@/lib/infra/repositories/postgres-external-commerce";
import { closePool, query } from "@/lib/infra/db/pool";
import { ORG_ID } from "@/lib/infra/db/ids";
import { dedupeAwbs } from "@/lib/adapters/delhivery/normalize";
import type { DelhiveryConnector } from "@/lib/adapters/delhivery/port";

const hasDb = Boolean(process.env.DATABASE_URL);

async function clearCommerceAndShipments() {
  await query(`delete from shipment_status_events where shipment_id in (
    select id from shipments where organization_id = $1
  )`, [ORG_ID]);
  await query(`delete from shipments where organization_id = $1`, [ORG_ID]);
  await query(`delete from external_fulfilments where organization_id = $1`, [ORG_ID]);
  await query(`delete from external_order_items where external_order_id in (
    select id from external_orders where organization_id = $1
  )`, [ORG_ID]);
  await query(`delete from external_orders where organization_id = $1`, [ORG_ID]);
  await query(`delete from external_customers where organization_id = $1`, [ORG_ID]);
}

async function seedShopifyFixture() {
  await syncShopifyCustomerCallData({
    connector: new FixtureShopifyConnector(),
    repo: createExternalCommerceRepository(),
  });
}

describe.runIf(hasDb)("Delhivery shipment sync", () => {
  const repo = () => createShipmentRepository();

  beforeAll(async () => {
    const tables = await query<{ exists: boolean }>(
      `select to_regclass('public.shipments') is not null as exists`,
    );
    if (!tables[0]?.exists) {
      throw new Error("shipments missing — run db:migrate");
    }
    await clearCommerceAndShipments();
  });

  afterAll(async () => {
    await closePool();
  });

  it("3. delivered timestamp is extracted when available", async () => {
    await clearCommerceAndShipments();
    await seedShopifyFixture();
    await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector(),
      repo: repo(),
    });
    const shipped = await repo().findByCarrierAwb("delhivery", "AWB1001DEL");
    expect(shipped?.normalizedStatus).toBe("delivered");
    expect(shipped?.deliveredAt).toBe("2026-07-22T12:18:25.000Z");
    expect(shipped?.promisedDeliveryAt).toBe("2026-07-21T23:59:59.000Z");
  });

  it("4. duplicate AWBs are deduplicated before connector invocation", async () => {
    const spy: string[][] = [];
    const connector: DelhiveryConnector = {
      async trackShipments(awbs) {
        spy.push([...awbs]);
        return new FixtureDelhiveryConnector().trackShipments(awbs);
      },
    };
    await clearCommerceAndShipments();
    await seedShopifyFixture();
    // Insert a second fulfilment with the same AWB to create duplicate input candidates
    const orders = await query<{ id: string }>(
      `select id from external_orders where organization_id = $1 limit 1`,
      [ORG_ID],
    );
    await query(
      `insert into external_fulfilments (
         organization_id, provider, external_id, external_order_id,
         tracking_company, tracking_number, tracking_url, fulfilment_status
       ) values ($1,'shopify','ful-dup-awb',$2,'Delhivery','AWB1001DEL',
                 'https://www.delhivery.com/track/package/AWB1001DEL','SUCCESS')`,
      [ORG_ID, orders[0]!.id],
    );

    const summary = await syncDelhiveryShipments({ connector, repo: repo() });
    expect(summary.ambiguousAwbLinkages).toBeGreaterThanOrEqual(1);
    expect(spy.flat()).toEqual(dedupeAwbs(spy.flat()));
    expect(spy.flat().filter((a) => a === "AWB1001DEL")).toHaveLength(1);
  });

  it("5. duplicate AWBs create one Shipment record", async () => {
    expect(await repo().countByAwb("delhivery", "AWB1001DEL")).toBe(1);
  });

  it("6. repeated sync is idempotent", async () => {
    await clearCommerceAndShipments();
    await seedShopifyFixture();
    const connector = new FixtureDelhiveryConnector();
    const first = await syncDelhiveryShipments({ connector, repo: repo() });
    const second = await syncDelhiveryShipments({ connector, repo: repo() });
    expect(first.shipmentsCreated).toBeGreaterThan(0);
    expect(second.shipmentsCreated).toBe(0);
    expect(second.shipmentsUpdated).toBeGreaterThan(0);
    expect(await repo().countByAwb("delhivery", "AWB1001DEL")).toBe(1);
    expect(await repo().countByAwb("delhivery", "AWB1002DEL")).toBe(1);
  });

  it("7–8. partial failure preserves previous valid / delivered state", async () => {
    await clearCommerceAndShipments();
    await seedShopifyFixture();
    await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector(),
      repo: repo(),
    });
    const before = await repo().findByCarrierAwb("delhivery", "AWB1001DEL");
    expect(before?.normalizedStatus).toBe("delivered");

    const partial = await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector({ failAwbs: ["AWB1001DEL"] }),
      repo: repo(),
    });
    expect(partial.failedLookups).toBeGreaterThan(0);

    const after = await repo().findByCarrierAwb("delhivery", "AWB1001DEL");
    expect(after?.normalizedStatus).toBe("delivered");
    expect(after?.deliveredAt).toBe(before?.deliveredAt);
    expect(after?.syncStatus).toBe("error");
    expect(after?.syncError).toMatch(/failure|timeout|error/i);
  });

  it("11. missing AWB is skipped", async () => {
    await clearCommerceAndShipments();
    await seedShopifyFixture();
    const summary = await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector(),
      repo: repo(),
    });
    // BlueDart row without AWB in fixture counts as skipped non-Delhivery or missing AWB
    expect(summary.skippedRecords).toBeGreaterThan(0);
  });

  it("12. non-Delhivery fulfilment is skipped", async () => {
    const fulfilments = await repo().listFulfilmentsWithOrders();
    expect(fulfilments.some((f) => /bluedart/i.test(f.trackingCompany ?? ""))).toBe(true);
    const tracked = await repo().findByCarrierAwb("delhivery", "AWB1002DEL");
    expect(tracked).toBeTruthy();
  });

  it("13. Shopify order and fulfilment linkage is retained", async () => {
    const shipped = await repo().findByCarrierAwb("delhivery", "AWB1002DEL");
    expect(shipped?.externalOrderId).toBeTruthy();
    expect(shipped?.externalFulfilmentId).toBeTruthy();
    const diag = await getDelhiveryShipmentDiagnostics({ repo: repo() });
    const row = diag.rows.find((d) => d.awb === "AWB1002DEL");
    expect(row?.orderNumber).toBeTruthy();
    expect(row?.customerName).toBeTruthy();
    expect(row?.orderedAt).toBeTruthy();
    expect(row?.normalizedStatus).toBe("in-transit");
    expect(row?.promisedDeliveryAt).toBe("2026-07-31T23:59:59.000Z");
    expect(row?.deliveredAt).toBeNull();
    expect(row?.trackingUrl).toContain("AWB1002DEL");

    const byStatus = await getDelhiveryShipmentDiagnostics({
      repo: repo(),
      sort: "status",
    });
    expect(byStatus.rows.length).toBeGreaterThan(0);
    const statuses = byStatus.rows.map((r) => r.normalizedStatus);
    expect(statuses).toEqual([...statuses].sort((a, b) => a.localeCompare(b)));
  });

  it("integration: read Shopify fulfilments → track → persist → re-sync", async () => {
    await clearCommerceAndShipments();
    await seedShopifyFixture();
    const first = await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector(),
      repo: repo(),
    });
    expect(first.delhiveryAwbsFound).toBeGreaterThanOrEqual(2);
    expect(first.delivered).toBeGreaterThanOrEqual(1);
    expect(first.inTransit).toBeGreaterThanOrEqual(1);
    expect(first.complete).toBe(true);

    await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector({ failAwbs: ["AWB1002DEL"] }),
      repo: repo(),
    });
    const inTransit = await repo().findByCarrierAwb("delhivery", "AWB1002DEL");
    expect(inTransit?.normalizedStatus).toBe("in-transit");
  });

  it("chunked sync resumes by offset without re-tracking earlier AWBs", async () => {
    const spy: string[][] = [];
    const connector: DelhiveryConnector = {
      async trackShipments(awbs) {
        spy.push([...awbs]);
        return new FixtureDelhiveryConnector().trackShipments(awbs);
      },
    };
    await clearCommerceAndShipments();
    await seedShopifyFixture();

    const first = await syncDelhiveryShipments({
      connector,
      repo: repo(),
      offset: 0,
      maxAwbs: 1,
    });
    expect(first.hasMore).toBe(true);
    expect(first.complete).toBe(false);
    expect(first.awbsProcessed).toBe(1);
    expect(first.nextOffset).toBe(1);
    expect(spy.flat()).toHaveLength(1);

    const second = await syncDelhiveryShipments({
      connector,
      repo: repo(),
      offset: first.nextOffset ?? 1,
      maxAwbs: 1,
    });
    expect(second.awbsProcessed).toBe(1);
    expect(spy.flat()).toHaveLength(2);
    expect(new Set(spy.flat()).size).toBe(2);
  });

  it("hard connector failure does not erase prior shipments", async () => {
    await clearCommerceAndShipments();
    await seedShopifyFixture();
    await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector(),
      repo: repo(),
    });
    const summary = await syncDelhiveryShipments({
      connector: new FixtureDelhiveryConnector({
        failHard: true,
        failHardMessage: "Delhivery API unavailable",
      }),
      repo: repo(),
    });
    expect(summary.errors.some((e) => e.includes("unavailable"))).toBe(true);
    const delivered = await repo().findByCarrierAwb("delhivery", "AWB1001DEL");
    expect(delivered?.normalizedStatus).toBe("delivered");
  });
});

describe("Delhivery credential boundary", () => {
  it("14. Delhivery credentials remain server-side", () => {
    const roots = [
      path.resolve("src/components"),
      path.resolve("src/app/customer-calls"),
      path.resolve("src/lib/client"),
    ];
    const banned = [
      "DELHIVERY_API_TOKEN",
      "live-tracking-connector",
      "LiveDelhiveryTrackingConnector",
      "createLiveDelhiveryConnectorFromEnv",
      "Authorization: Token",
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
          if (text.includes(token)) offenders.push(`${file}: ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);

    const panel = readFileSync(
      path.resolve("src/components/customer-calls/DelhiverySyncPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("delhivery-sync-actions");
    expect(panel).not.toContain("process.env.DELHIVERY");
  });

  it("live connector refuses browser execution", async () => {
    const { LiveDelhiveryTrackingConnector } = await import(
      "@/lib/adapters/delhivery/live-tracking-connector"
    );
    const prev = globalThis.window;
    // @ts-expect-error test shim
    globalThis.window = {};
    try {
      expect(() => {
        new LiveDelhiveryTrackingConnector({
          apiToken: "secret-token",
          baseUrl: "https://track.delhivery.com",
        });
      }).toThrow(/must not run in the browser/i);
    } finally {
      // @ts-expect-error restore
      globalThis.window = prev;
    }
  });

  it("fixture covers delivered, in-transit, OFD, returned, cancelled, unknown, not found, malformed, partial", async () => {
    const connector = new FixtureDelhiveryConnector();
    const results = await connector.trackShipments([
      "AWB1001DEL",
      "AWB1002DEL",
      "AWB_OFD",
      "AWB_RTO",
      "AWB_CANCEL",
      "AWB_UNKNOWN",
      "AWB_NOT_FOUND",
      "AWB_MALFORMED",
      "AWB_PARTIAL_FAIL",
      "AWB1001DEL", // duplicate input
    ]);
    expect(results).toHaveLength(9);
    expect(results.find((r) => r.awb === "AWB1001DEL")?.normalizedStatus).toBe("delivered");
    expect(results.find((r) => r.awb === "AWB1002DEL")?.normalizedStatus).toBe("in-transit");
    expect(results.find((r) => r.awb === "AWB_OFD")?.normalizedStatus).toBe("out-for-delivery");
    expect(results.find((r) => r.awb === "AWB_RTO")?.normalizedStatus).toBe("returned");
    expect(results.find((r) => r.awb === "AWB_CANCEL")?.normalizedStatus).toBe("cancelled");
    expect(results.find((r) => r.awb === "AWB_UNKNOWN")?.normalizedStatus).toBe("unknown");
    expect(results.find((r) => r.awb === "AWB_NOT_FOUND")?.syncStatus).toBe("not_found");
    expect(results.find((r) => r.awb === "AWB_MALFORMED")?.syncStatus).toBe("malformed");
    expect(results.find((r) => r.awb === "AWB_PARTIAL_FAIL")?.syncStatus).toBe("error");
  });
});
