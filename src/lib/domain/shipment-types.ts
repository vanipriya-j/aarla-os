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
