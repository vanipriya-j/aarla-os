import type { MetricStatus } from "@/lib/domain/operating-week";

export type ManualMetricKind = "followers" | "views";

export interface OperatingTargets {
  organizationId: string;
  followersPerWeek: number;
  viewsPerWeek: number;
  ordersPerDay: number;
  revenuePerDay: number;
  timezone: string;
  updatedAt: string;
}

export interface ManualMetric {
  weekStart: string; // YYYY-MM-DD (Monday)
  kind: ManualMetricKind;
  value: number;
  notes: string;
  updatedAt: string | null;
}

export interface UpsertManualMetricInput {
  weekStart: string; // YYYY-MM-DD (Monday)
  kind: ManualMetricKind;
  value: number;
  notes?: string;
}

export interface MetricCard {
  key: "orders" | "revenue" | "followers" | "views";
  label: string;
  unit?: string;
  actual: number;
  target: number;
  expectedByNow: number;
  status: MetricStatus;
}

export interface DailyStripPoint {
  /** YYYY-MM-DD, local (Asia/Kolkata) calendar date. */
  date: string;
  /** Mon, Tue, … */
  dayLabel: string;
  orders: number;
  revenue: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface RetailerWeekRow {
  partnerId: string;
  partnerName: string;
  partnerType: string;
  locationId: string;
  lastTransferDate: string | null; // YYYY-MM-DD
  transferredThisWeek: boolean;
  daysSinceLastTransfer: number | null;
}

export interface VendorWeekRow {
  purchaseOrderId: string;
  purchaseOrderCode: string;
  vendorId: string;
  vendorName: string;
  productId: string;
  productTitle: string;
  status: string;
  quantityOrdered: number;
  quantityReceived: number;
  orderedDate: string | null; // YYYY-MM-DD
  requiredDate: string | null; // YYYY-MM-DD
  updatedAt: string; // ISO instant
  completedThisWeek: boolean;
}

export interface WeeklyBoard {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEndExclusive: string; // YYYY-MM-DD (following Monday)
  weekLabel: string;
  timezone: string;
  /** 0=Mon..6=Sun for the current week, <0 for a future week, >=7 for a fully-elapsed past week. */
  todayIndex: number;
  isCurrentWeek: boolean;
  isPastWeek: boolean;
  isFutureWeek: boolean;
  targets: OperatingTargets;
  metrics: {
    orders: MetricCard;
    revenue: MetricCard;
    followers: MetricCard;
    views: MetricCard;
  };
  dailyStrip: DailyStripPoint[];
  retailers: {
    rows: RetailerWeekRow[];
    totalActive: number;
    completedThisWeek: number;
  };
  vendors: {
    pending: VendorWeekRow[];
    completedThisWeek: VendorWeekRow[];
  };
  manualMetrics: {
    followers: ManualMetric;
    views: ManualMetric;
  };
}
