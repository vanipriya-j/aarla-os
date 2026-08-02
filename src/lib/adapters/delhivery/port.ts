import type {
  NormalizedShipmentStatus,
  ShipmentSyncStatus,
} from "@/lib/domain/shipment-types";

export type TrackedScan = {
  providerStatus: string | null;
  providerStatusType: string | null;
  providerTimestamp: string | null;
  scanLocation: string | null;
  instructions: string | null;
  statusCode: string | null;
  rawEvent?: unknown;
};

export type TrackedShipmentResult = {
  awb: string;
  providerStatus: string | null;
  providerStatusType: string | null;
  normalizedStatus: NormalizedShipmentStatus;
  deliveredAt?: string | null;
  latestScanAt?: string | null;
  latestScanLocation?: string | null;
  syncStatus: ShipmentSyncStatus;
  error?: string;
  rawProviderPayload?: unknown;
  scans?: TrackedScan[];
};

export interface DelhiveryConnector {
  trackShipments(awbNumbers: string[]): Promise<TrackedShipmentResult[]>;
}
