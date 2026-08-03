import type {
  NormalizedShipmentStatus,
  Shipment,
  ShipmentCarrier,
  ShipmentDiagnosticRow,
  ShipmentSyncStatus,
} from "@/lib/domain/shipment-types";
import type { TrackedScan } from "@/lib/adapters/delhivery/port";

export type FulfilmentTrackingRow = {
  fulfilmentId: string;
  fulfilmentExternalId: string;
  orderId: string;
  orderNumber: string;
  trackingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

export type UpsertShipmentInput = {
  carrier: ShipmentCarrier;
  awb: string;
  externalOrderId: string | null;
  externalFulfilmentId: string | null;
  providerStatus: string | null;
  providerStatusType: string | null;
  normalizedStatus: NormalizedShipmentStatus;
  deliveredAt: string | null;
  latestScanAt: string | null;
  latestScanLocation: string | null;
  syncStatus: ShipmentSyncStatus;
  syncError: string | null;
  rawProviderPayload?: unknown;
  /** When true, update tracking fields. When false, only sync error metadata. */
  applyTrackingUpdate: boolean;
};

export type AppendEventsInput = {
  shipmentId: string;
  awb: string;
  scans: TrackedScan[];
};

export type UpsertShipmentResult = { id: string; created: boolean; shipment: Shipment };

export interface ShipmentRepository {
  listFulfilmentsWithOrders(): Promise<FulfilmentTrackingRow[]>;
  findByCarrierAwb(carrier: ShipmentCarrier, awb: string): Promise<Shipment | null>;
  upsertShipment(input: UpsertShipmentInput): Promise<UpsertShipmentResult>;
  markSyncFailure(
    carrier: ShipmentCarrier,
    awb: string,
    syncStatus: ShipmentSyncStatus,
    syncError: string,
  ): Promise<Shipment | null>;
  appendStatusEvents(input: AppendEventsInput): Promise<number>;
  listDiagnostics(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<{
    rows: ShipmentDiagnosticRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;
  countByAwb(carrier: ShipmentCarrier, awb: string): Promise<number>;
}
