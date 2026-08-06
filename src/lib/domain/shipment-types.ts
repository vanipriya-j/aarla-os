export const NORMALIZED_SHIPMENT_STATUSES = [
  "unknown",
  "manifested",
  "picked-up",
  "in-transit",
  "out-for-delivery",
  "delivered",
  "delivery-failed",
  "returned",
  "cancelled",
] as const;
export type NormalizedShipmentStatus = (typeof NORMALIZED_SHIPMENT_STATUSES)[number];

export const SHIPMENT_SYNC_STATUSES = [
  "ok",
  "error",
  "not_found",
  "skipped",
  "malformed",
] as const;
export type ShipmentSyncStatus = (typeof SHIPMENT_SYNC_STATUSES)[number];

export const SHIPMENT_CARRIERS = ["delhivery"] as const;
export type ShipmentCarrier = (typeof SHIPMENT_CARRIERS)[number];

export interface Shipment {
  id: string;
  organizationId: string;
  externalOrderId: string | null;
  externalFulfilmentId: string | null;
  carrier: ShipmentCarrier;
  awb: string;
  providerStatus: string | null;
  providerStatusType: string | null;
  normalizedStatus: NormalizedShipmentStatus;
  deliveredAt: string | null;
  latestScanAt: string | null;
  latestScanLocation: string | null;
  lastSyncedAt: string;
  syncStatus: ShipmentSyncStatus;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentStatusEvent {
  id: string;
  shipmentId: string;
  providerStatus: string | null;
  providerStatusType: string | null;
  normalizedStatus: NormalizedShipmentStatus;
  providerTimestamp: string | null;
  scanLocation: string | null;
  instructions: string | null;
  eventFingerprint: string;
  createdAt: string;
}

export interface ShipmentDiagnosticRow {
  id: string;
  awb: string;
  orderNumber: string | null;
  customerName: string | null;
  orderedAt: string | null;
  carrier: ShipmentCarrier;
  normalizedStatus: NormalizedShipmentStatus;
  providerStatus: string | null;
  deliveredAt: string | null;
  latestScanAt: string | null;
  latestScanLocation: string | null;
  lastSyncedAt: string;
  syncError: string | null;
  syncStatus: ShipmentSyncStatus;
}

export type ShipmentDiagnosticsPage = {
  rows: ShipmentDiagnosticRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export interface DelhiverySyncSummary {
  fulfilmentsEvaluated: number;
  delhiveryAwbsFound: number;
  uniqueAwbsTracked: number;
  shipmentsCreated: number;
  shipmentsUpdated: number;
  delivered: number;
  inTransit: number;
  outForDelivery: number;
  returned: number;
  cancelled: number;
  unknown: number;
  failedLookups: number;
  skippedRecords: number;
  ambiguousAwbLinkages: number;
  errors: string[];
  /** AWBs tracked in this chunk */
  awbsProcessed?: number;
  /** Chunked sync: more AWBs remain */
  hasMore?: boolean;
  /** Pass back into the next sync call */
  nextOffset?: number | null;
  /** True when this call finished the full AWB list */
  complete?: boolean;
}

export function emptyDelhiverySyncSummary(): DelhiverySyncSummary {
  return {
    fulfilmentsEvaluated: 0,
    delhiveryAwbsFound: 0,
    uniqueAwbsTracked: 0,
    shipmentsCreated: 0,
    shipmentsUpdated: 0,
    delivered: 0,
    inTransit: 0,
    outForDelivery: 0,
    returned: 0,
    cancelled: 0,
    unknown: 0,
    failedLookups: 0,
    skippedRecords: 0,
    ambiguousAwbLinkages: 0,
    errors: [],
    awbsProcessed: 0,
    hasMore: false,
    nextOffset: null,
    complete: true,
  };
}

export function mergeDelhiverySyncSummaries(
  a: DelhiverySyncSummary,
  b: DelhiverySyncSummary,
): DelhiverySyncSummary {
  return {
    fulfilmentsEvaluated: Math.max(a.fulfilmentsEvaluated, b.fulfilmentsEvaluated),
    delhiveryAwbsFound: Math.max(a.delhiveryAwbsFound, b.delhiveryAwbsFound),
    uniqueAwbsTracked: Math.max(a.uniqueAwbsTracked, b.uniqueAwbsTracked),
    shipmentsCreated: a.shipmentsCreated + b.shipmentsCreated,
    shipmentsUpdated: a.shipmentsUpdated + b.shipmentsUpdated,
    delivered: a.delivered + b.delivered,
    inTransit: a.inTransit + b.inTransit,
    outForDelivery: a.outForDelivery + b.outForDelivery,
    returned: a.returned + b.returned,
    cancelled: a.cancelled + b.cancelled,
    unknown: a.unknown + b.unknown,
    failedLookups: a.failedLookups + b.failedLookups,
    skippedRecords: Math.max(a.skippedRecords, b.skippedRecords),
    ambiguousAwbLinkages: Math.max(a.ambiguousAwbLinkages, b.ambiguousAwbLinkages),
    errors: [...a.errors, ...b.errors].slice(0, 20),
    awbsProcessed: (a.awbsProcessed ?? 0) + (b.awbsProcessed ?? 0),
    hasMore: Boolean(b.hasMore),
    nextOffset: b.nextOffset ?? null,
    complete: Boolean(b.complete),
  };
}

export function tallyNormalizedStatus(
  summary: DelhiverySyncSummary,
  status: NormalizedShipmentStatus,
): void {
  switch (status) {
    case "delivered":
      summary.delivered += 1;
      break;
    case "in-transit":
    case "picked-up":
    case "manifested":
      summary.inTransit += 1;
      break;
    case "out-for-delivery":
      summary.outForDelivery += 1;
      break;
    case "returned":
      summary.returned += 1;
      break;
    case "cancelled":
      summary.cancelled += 1;
      break;
    default:
      summary.unknown += 1;
  }
}
