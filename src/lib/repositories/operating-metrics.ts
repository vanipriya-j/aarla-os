import type { ManualMetricKind } from "@/lib/domain/operating-metrics-types";

export interface OrdersRevenueDayRow {
  /** YYYY-MM-DD, local (operating timezone) calendar date. */
  date: string;
  orders: number;
  revenue: number;
}

export interface OrdersRevenueSummary {
  totalOrders: number;
  totalRevenue: number;
  byDay: OrdersRevenueDayRow[];
}

export interface RetailerWeekRowDb {
  partnerId: string;
  partnerName: string;
  partnerType: string;
  locationId: string;
  lastTransferDate: string | null; // YYYY-MM-DD
  transferredThisWeek: boolean;
}

export interface VendorPurchaseOrderRowDb {
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

export interface OperatingTargetsRow {
  organizationId: string;
  followersPerWeek: number;
  viewsPerWeek: number;
  ordersPerDay: number;
  revenuePerDay: number;
  timezone: string;
  updatedAt: string;
}

export interface ManualMetricRow {
  weekStart: string; // YYYY-MM-DD
  kind: ManualMetricKind;
  value: number;
  notes: string;
  updatedAt: string;
}

export interface UpsertManualMetricRowInput {
  weekStart: string; // YYYY-MM-DD
  kind: ManualMetricKind;
  value: number;
  notes: string;
}

export interface OperatingMetricsRepository {
  /**
   * Orders/revenue from `external_orders` (is_valid = true, currency = 'INR')
   * within [startInstantIso, endExclusiveInstantIso), bucketed by local
   * calendar day.
   */
  getOrdersRevenueSummary(
    startInstantIso: string,
    endExclusiveInstantIso: string,
  ): Promise<OrdersRevenueSummary>;

  /** Active retailers (Retail Partner | Café with a Partner location) + transfer status for [weekStartDate, weekEndExclusiveDate). */
  listActiveRetailers(
    weekStartDate: string,
    weekEndExclusiveDate: string,
  ): Promise<RetailerWeekRowDb[]>;

  /**
   * POs pending action, plus any completed (status Received, updated_at within
   * [startInstantIso, endExclusiveInstantIso)).
   */
  listVendorPurchaseOrders(
    startInstantIso: string,
    endExclusiveInstantIso: string,
  ): Promise<VendorPurchaseOrderRowDb[]>;

  /** Typed org targets — seeded via migration defaults; never null once seeded. */
  getOperatingTargets(): Promise<OperatingTargetsRow>;

  getManualMetrics(weekStartDate: string): Promise<ManualMetricRow[]>;

  upsertManualMetric(input: UpsertManualMetricRowInput): Promise<ManualMetricRow>;
}
