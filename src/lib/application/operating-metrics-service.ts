import {
  createOperatingMetricsRepository,
} from "@/lib/infra/repositories/postgres-operating-metrics";
import {
  DEFAULT_OPERATING_TIMEZONE,
  dayIndexInWeek,
  expectedWtd,
  isoDate,
  metricStatus,
  shiftWeek,
  weekRange,
  weekStartMonday,
} from "@/lib/domain/operating-week";
import type {
  DailyStripPoint,
  ManualMetric,
  MetricCard,
  OperatingTargets,
  RetailerWeekRow,
  UpsertManualMetricInput,
  VendorWeekRow,
  WeeklyBoard,
} from "@/lib/domain/operating-metrics-types";
import type { OperatingMetricsRepository } from "@/lib/repositories/operating-metrics";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function repo(): OperatingMetricsRepository {
  return createOperatingMetricsRepository();
}

function mapTargets(row: {
  organizationId: string;
  followersPerWeek: number;
  viewsPerWeek: number;
  ordersPerDay: number;
  revenuePerDay: number;
  timezone: string;
  updatedAt: string;
}): OperatingTargets {
  return { ...row };
}

function emptyManualMetric(weekStart: string, kind: "followers" | "views"): ManualMetric {
  return { weekStart, kind, value: 0, notes: "", updatedAt: null };
}

function daysSince(fromIsoDate: string, toDate: Date): number {
  const from = new Date(`${fromIsoDate}T00:00:00.000Z`);
  return Math.floor((toDate.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Assemble the full Weekly Operating Board for `weekStartIso` (defaults to
 * the current Mon–Sun week in Asia/Kolkata). Projection only — no AI.
 */
export async function getWeeklyBoard(weekStartIso?: string): Promise<WeeklyBoard> {
  const r = repo();
  const now = new Date();

  const weekStart = weekStartIso
    ? weekStartMonday(new Date(`${weekStartIso}T00:00:00.000Z`))
    : weekStartMonday(now);
  const weekEndExclusive = shiftWeek(weekStart, 1);
  const range = weekRange(weekStart);
  const weekStartDateStr = isoDate(weekStart);
  const weekEndExclusiveDateStr = isoDate(weekEndExclusive);

  const todayIndex = dayIndexInWeek(now, weekStart, DEFAULT_OPERATING_TIMEZONE);
  const isCurrentWeek = todayIndex >= 0 && todayIndex <= 6;
  const isPastWeek = todayIndex > 6;
  const isFutureWeek = todayIndex < 0;
  const expectedIndex = isPastWeek ? 7 : todayIndex;

  const [targetsRow, ordersRevenue, retailerRows, vendorRows, manualRows] = await Promise.all([
    r.getOperatingTargets(),
    r.getOrdersRevenueSummary(range.start.toISOString(), range.endExclusive.toISOString()),
    r.listActiveRetailers(weekStartDateStr, weekEndExclusiveDateStr),
    r.listVendorPurchaseOrders(range.start.toISOString(), range.endExclusive.toISOString()),
    r.getManualMetrics(weekStartDateStr),
  ]);

  const targets = mapTargets(targetsRow);

  const byDayMap = new Map(ordersRevenue.byDay.map((d) => [d.date, d]));
  const dailyStrip: DailyStripPoint[] = Array.from({ length: 7 }, (_, i) => {
    const date = isoDate(new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000));
    const bucket = byDayMap.get(date);
    return {
      date,
      dayLabel: DAY_LABELS[i],
      orders: bucket?.orders ?? 0,
      revenue: bucket?.revenue ?? 0,
      isToday: isCurrentWeek && todayIndex === i,
      isFuture: isCurrentWeek ? i > todayIndex : isFutureWeek,
    };
  });

  const totalOrders = ordersRevenue.totalOrders;
  const totalRevenue = ordersRevenue.totalRevenue;

  const ordersTarget = targets.ordersPerDay * 7;
  const revenueTarget = targets.revenuePerDay * 7;
  const ordersExpected = expectedWtd(targets.ordersPerDay, expectedIndex);
  const revenueExpected = expectedWtd(targets.revenuePerDay, expectedIndex);

  const followersManual =
    manualRows.find((m) => m.kind === "followers") ?? null;
  const viewsManual = manualRows.find((m) => m.kind === "views") ?? null;

  const followersActual = followersManual?.value ?? 0;
  const viewsActual = viewsManual?.value ?? 0;
  // Followers/views are weekly (not daily) targets — full week expected once elapsed at all.
  const followersExpected = expectedIndex < 0 ? 0 : targets.followersPerWeek;
  const viewsExpected = expectedIndex < 0 ? 0 : targets.viewsPerWeek;

  const orders: MetricCard = {
    key: "orders",
    label: "Orders",
    actual: totalOrders,
    target: ordersTarget,
    expectedByNow: ordersExpected,
    status: metricStatus(totalOrders, ordersTarget, ordersExpected),
  };
  const revenue: MetricCard = {
    key: "revenue",
    label: "Revenue",
    unit: "INR",
    actual: totalRevenue,
    target: revenueTarget,
    expectedByNow: revenueExpected,
    status: metricStatus(totalRevenue, revenueTarget, revenueExpected),
  };
  const followers: MetricCard = {
    key: "followers",
    label: "Followers",
    actual: followersActual,
    target: targets.followersPerWeek,
    expectedByNow: followersExpected,
    status: metricStatus(followersActual, targets.followersPerWeek, followersExpected),
  };
  const views: MetricCard = {
    key: "views",
    label: "Views",
    actual: viewsActual,
    target: targets.viewsPerWeek,
    expectedByNow: viewsExpected,
    status: metricStatus(viewsActual, targets.viewsPerWeek, viewsExpected),
  };

  const retailerRowsMapped: RetailerWeekRow[] = retailerRows.map((row) => ({
    partnerId: row.partnerId,
    partnerName: row.partnerName,
    partnerType: row.partnerType,
    locationId: row.locationId,
    lastTransferDate: row.lastTransferDate,
    transferredThisWeek: row.transferredThisWeek,
    daysSinceLastTransfer: row.lastTransferDate ? daysSince(row.lastTransferDate, now) : null,
  }));

  const vendorRowsMapped: VendorWeekRow[] = vendorRows.map((row) => ({
    purchaseOrderId: row.purchaseOrderId,
    purchaseOrderCode: row.purchaseOrderCode,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    productId: row.productId,
    productTitle: row.productTitle,
    status: row.status,
    quantityOrdered: row.quantityOrdered,
    quantityReceived: row.quantityReceived,
    orderedDate: row.orderedDate,
    requiredDate: row.requiredDate,
    updatedAt: row.updatedAt,
    completedThisWeek: row.completedThisWeek,
  }));

  const board: WeeklyBoard = {
    weekStart: weekStartDateStr,
    weekEndExclusive: weekEndExclusiveDateStr,
    weekLabel: range.label,
    timezone: DEFAULT_OPERATING_TIMEZONE,
    todayIndex,
    isCurrentWeek,
    isPastWeek,
    isFutureWeek,
    targets,
    metrics: { orders, revenue, followers, views },
    dailyStrip,
    retailers: {
      rows: retailerRowsMapped,
      totalActive: retailerRowsMapped.length,
      completedThisWeek: retailerRowsMapped.filter((r) => r.transferredThisWeek).length,
    },
    vendors: {
      pending: vendorRowsMapped.filter((v) => v.status !== "Received"),
      completedThisWeek: vendorRowsMapped.filter(
        (v) => v.status === "Received" && v.completedThisWeek,
      ),
    },
    manualMetrics: {
      followers: followersManual ?? emptyManualMetric(weekStartDateStr, "followers"),
      views: viewsManual ?? emptyManualMetric(weekStartDateStr, "views"),
    },
  };

  return board;
}

export async function upsertManualMetric(input: UpsertManualMetricInput): Promise<ManualMetric> {
  const weekStart = isoDate(weekStartMonday(new Date(`${input.weekStart}T00:00:00.000Z`)));
  const row = await repo().upsertManualMetric({
    weekStart,
    kind: input.kind,
    value: input.value,
    notes: input.notes ?? "",
  });
  return row;
}

export async function getOperatingTargets(): Promise<OperatingTargets> {
  const row = await repo().getOperatingTargets();
  return mapTargets(row);
}
