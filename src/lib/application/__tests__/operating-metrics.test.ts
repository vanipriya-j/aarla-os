import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query } from "@/lib/infra/db/pool";
import { ORG_ID } from "@/lib/infra/db/ids";
import {
  getOperatingTargets,
  getWeeklyBoard,
  upsertManualMetric,
} from "@/lib/application/operating-metrics-service";
import { isoDate, shiftWeek, weekRange, weekStartMonday } from "@/lib/domain/operating-week";

const hasDb = Boolean(process.env.DATABASE_URL);
const runId = `${Date.now()}`;

describe.runIf(hasDb)("Weekly Operating Board service", () => {
  // A week with no seed data, so orders/revenue assertions can be exact.
  const weekStart = weekStartMonday(new Date("2019-05-01T00:00:00.000Z"));
  const weekStartIso = isoDate(weekStart);
  const range = weekRange(weekStart);
  const dayMs = 24 * 60 * 60 * 1000;

  const orderNumberPrefix = `TESTWK-${runId}`;
  const poCompletedCode = `TESTWK-PO-DONE-${runId}`;
  const poPendingCode = `TESTWK-PO-PENDING-${runId}`;
  const movementCode = `TESTWK-TR-${runId}`;

  let vendorId: string;
  let productId: string;
  let studioLocationId: string;
  let nimalliLocationId: string;

  beforeAll(async () => {
    const vendorRows = await query<{ id: string }>(
      `select id from vendors where organization_id = $1 order by code limit 1`,
      [ORG_ID],
    );
    const productRows = await query<{ id: string }>(
      `select id from products where organization_id = $1 order by code limit 1`,
      [ORG_ID],
    );
    const studioRows = await query<{ id: string }>(
      `select id from locations where organization_id = $1 and code = 'loc-studio'`,
      [ORG_ID],
    );
    const nimalliRows = await query<{ id: string }>(
      `select id from locations where organization_id = $1 and code = 'loc-partner-nimalli'`,
      [ORG_ID],
    );
    if (!vendorRows[0] || !productRows[0] || !studioRows[0] || !nimalliRows[0]) {
      throw new Error("Seed data missing — run db:migrate && db:seed");
    }
    vendorId = vendorRows[0].id;
    productId = productRows[0].id;
    studioLocationId = studioRows[0].id;
    nimalliLocationId = nimalliRows[0].id;

    // Two valid INR orders inside the week (Tue + Thu).
    await query(
      `insert into external_orders (
         organization_id, provider, external_id, order_number, order_date,
         is_valid, total_amount, currency
       ) values ($1,'shopify',$2,$3,$4,true,$5,'INR')`,
      [ORG_ID, `${orderNumberPrefix}-A`, `${orderNumberPrefix}-A`,
        new Date(range.start.getTime() + 1 * dayMs + 6 * 3_600_000).toISOString(), 1000],
    );
    await query(
      `insert into external_orders (
         organization_id, provider, external_id, order_number, order_date,
         is_valid, total_amount, currency
       ) values ($1,'shopify',$2,$3,$4,true,$5,'INR')`,
      [ORG_ID, `${orderNumberPrefix}-B`, `${orderNumberPrefix}-B`,
        new Date(range.start.getTime() + 3 * dayMs + 9 * 3_600_000).toISOString(), 2500.5],
    );
    // Invalid order in-week — must be excluded.
    await query(
      `insert into external_orders (
         organization_id, provider, external_id, order_number, order_date,
         is_valid, total_amount, currency
       ) values ($1,'shopify',$2,$3,$4,false,$5,'INR')`,
      [ORG_ID, `${orderNumberPrefix}-C`, `${orderNumberPrefix}-C`,
        new Date(range.start.getTime() + 2 * dayMs).toISOString(), 9999],
    );
    // Valid order, but one hour before the week starts — must be excluded.
    await query(
      `insert into external_orders (
         organization_id, provider, external_id, order_number, order_date,
         is_valid, total_amount, currency
       ) values ($1,'shopify',$2,$3,$4,true,$5,'INR')`,
      [ORG_ID, `${orderNumberPrefix}-D`, `${orderNumberPrefix}-D`,
        new Date(range.start.getTime() - 3_600_000).toISOString(), 500],
    );
    // Valid, in-week, but non-INR — must be excluded (INR-only v1).
    await query(
      `insert into external_orders (
         organization_id, provider, external_id, order_number, order_date,
         is_valid, total_amount, currency
       ) values ($1,'shopify',$2,$3,$4,true,$5,'USD')`,
      [ORG_ID, `${orderNumberPrefix}-E`, `${orderNumberPrefix}-E`,
        new Date(range.start.getTime() + 2 * dayMs).toISOString(), 100],
    );

    // Transfer into Nimalli's Partner location, inside the week.
    await query(
      `insert into stock_movements (
         organization_id, code, movement_date, product_id, quantity,
         from_location_id, to_location_id, movement_type, reference, notes
       ) values ($1,$2,$3,$4,5,$5,$6,'Transfer',$7,'')`,
      [
        ORG_ID,
        movementCode,
        isoDate(new Date(weekStart.getTime() + 2 * dayMs)),
        productId,
        studioLocationId,
        nimalliLocationId,
        movementCode,
      ],
    );

    // A completed (Received, updated this week) PO.
    await query(
      `insert into purchase_orders (
         organization_id, code, vendor_id, product_id, quantity_ordered,
         quantity_received, unit_cost, status, ordered_date, updated_at
       ) values ($1,$2,$3,$4,50,50,10,'Received',$5,$6)`,
      [
        ORG_ID,
        poCompletedCode,
        vendorId,
        productId,
        isoDate(new Date(weekStart.getTime() - 30 * dayMs)),
        new Date(range.start.getTime() + 1 * dayMs).toISOString(),
      ],
    );
    // A pending PO (not time-scoped — always shows while status is pending).
    await query(
      `insert into purchase_orders (
         organization_id, code, vendor_id, product_id, quantity_ordered,
         quantity_received, unit_cost, status, ordered_date, updated_at
       ) values ($1,$2,$3,$4,80,0,12,'Sent',$5::date,$5::date)`,
      [ORG_ID, poPendingCode, vendorId, productId, weekStartIso],
    );
  });

  afterAll(async () => {
    await query(`delete from external_orders where organization_id = $1 and order_number like $2`, [
      ORG_ID,
      `${orderNumberPrefix}-%`,
    ]);
    await query(`delete from purchase_orders where organization_id = $1 and code like $2`, [
      ORG_ID,
      `TESTWK-PO-%-${runId}`,
    ]);
    await query(
      `delete from operating_manual_metrics where organization_id = $1 and week_start = $2::date`,
      [ORG_ID, weekStartIso],
    );
    // stock_movements are append-only/immutable by design — left in place, as elsewhere in this suite.
    await closePool();
  });

  it("computes orders/revenue for the requested week from external_orders", async () => {
    const board = await getWeeklyBoard(weekStartIso);

    expect(board.weekStart).toBe(weekStartIso);
    expect(board.metrics.orders.actual).toBe(2);
    expect(board.metrics.revenue.actual).toBe(3500.5);

    const total = board.dailyStrip.reduce(
      (acc, d) => ({ orders: acc.orders + d.orders, revenue: acc.revenue + d.revenue }),
      { orders: 0, revenue: 0 },
    );
    expect(total.orders).toBe(2);
    expect(total.revenue).toBe(3500.5);
    expect(board.dailyStrip).toHaveLength(7);
    expect(board.dailyStrip[0].dayLabel).toBe("Mon");
    expect(board.dailyStrip[6].dayLabel).toBe("Sun");
  });

  it("does not leak orders into an adjacent week", async () => {
    const nextWeekIso = isoDate(shiftWeek(weekStart, 1));
    const board = await getWeeklyBoard(nextWeekIso);
    expect(board.weekStart).toBe(nextWeekIso);
    expect(board.metrics.orders.actual).toBe(0);
    expect(board.metrics.revenue.actual).toBe(0);
  });

  it("marks an active retailer's transfer status for the week", async () => {
    const board = await getWeeklyBoard(weekStartIso);

    const partnerTypes = new Set(board.retailers.rows.map((r) => r.partnerType));
    expect(partnerTypes.has("Distributor")).toBe(false); // NGS excluded

    const nimalli = board.retailers.rows.find((r) => r.partnerName === "Nimalli");
    expect(nimalli).toBeTruthy();
    expect(nimalli!.transferredThisWeek).toBe(true);

    const freshly = board.retailers.rows.find((r) => r.partnerName === "Freshly Brewed");
    expect(freshly).toBeTruthy();
    expect(freshly!.transferredThisWeek).toBe(false);

    expect(board.retailers.completedThisWeek).toBeGreaterThanOrEqual(1);
  });

  it("splits vendor purchase orders into pending vs completed this week", async () => {
    const board = await getWeeklyBoard(weekStartIso);

    const completed = board.vendors.completedThisWeek.find(
      (v) => v.purchaseOrderCode === poCompletedCode,
    );
    expect(completed).toBeTruthy();
    expect(completed!.status).toBe("Received");

    const pending = board.vendors.pending.find((v) => v.purchaseOrderCode === poPendingCode);
    expect(pending).toBeTruthy();
    expect(pending!.status).toBe("Sent");
    expect(board.vendors.pending.every((v) => v.status !== "Received")).toBe(true);
  });

  it("persists a manual metric and reflects it in the board", async () => {
    const saved = await upsertManualMetric({
      weekStart: weekStartIso,
      kind: "followers",
      value: 120,
      notes: "Grew via reels",
    });
    expect(saved.value).toBe(120);
    expect(saved.notes).toBe("Grew via reels");

    const board = await getWeeklyBoard(weekStartIso);
    expect(board.manualMetrics.followers.value).toBe(120);
    expect(board.metrics.followers.actual).toBe(120);

    const updated = await upsertManualMetric({
      weekStart: weekStartIso,
      kind: "followers",
      value: 150,
    });
    expect(updated.value).toBe(150);
    expect(updated.notes).toBe("");
  });

  it("exposes typed org targets with Asia/Kolkata defaults", async () => {
    const targets = await getOperatingTargets();
    expect(targets.timezone).toBe("Asia/Kolkata");
    expect(targets.followersPerWeek).toBeGreaterThan(0);
    expect(targets.viewsPerWeek).toBeGreaterThan(0);
    expect(targets.ordersPerDay).toBeGreaterThan(0);
    expect(targets.revenuePerDay).toBeGreaterThan(0);
  });

  it("resolves the current week by default", async () => {
    const board = await getWeeklyBoard();
    expect(board.isCurrentWeek).toBe(true);
    expect(board.todayIndex).toBeGreaterThanOrEqual(0);
    expect(board.todayIndex).toBeLessThanOrEqual(6);
    expect(board.weekStart).toBe(isoDate(weekStartMonday(new Date())));
  });
});
