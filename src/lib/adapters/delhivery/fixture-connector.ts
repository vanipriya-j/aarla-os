import type { DelhiveryConnector, TrackedShipmentResult } from "./port";
import { dedupeAwbs, normalizeDelhiveryStatus } from "./normalize";

type FixtureCase = {
  providerStatus: string;
  providerStatusType: string;
  deliveredAt?: string | null;
  promisedDeliveryAt?: string | null;
  latestScanAt?: string | null;
  latestScanLocation?: string | null;
  pickedUpDate?: string | null;
  instructions?: string | null;
  syncStatus?: TrackedShipmentResult["syncStatus"];
  error?: string;
  scans?: TrackedShipmentResult["scans"];
  raw?: unknown;
};

const CASES: Record<string, FixtureCase> = {
  AWB1001DEL: {
    providerStatus: "Delivered",
    providerStatusType: "DL",
    deliveredAt: "2026-07-22T12:18:25.000Z",
    promisedDeliveryAt: "2026-07-21T23:59:59.000Z",
    latestScanAt: "2026-07-22T12:18:25.000Z",
    latestScanLocation: "Chennai_Guindy_C (Tamil Nadu)",
    pickedUpDate: "2026-07-20T10:00:00.000Z",
    instructions: "Delivered to consignee",
    scans: [
      {
        providerStatus: "Manifested",
        providerStatusType: "UD",
        providerTimestamp: "2026-07-20T08:00:00.000Z",
        scanLocation: "Chennai_Guindy_C (Tamil Nadu)",
        instructions: "Shipment details manifested",
        statusCode: "X-UCI",
      },
      {
        providerStatus: "Delivered",
        providerStatusType: "DL",
        providerTimestamp: "2026-07-22T12:18:25.000Z",
        scanLocation: "Chennai_Guindy_C (Tamil Nadu)",
        instructions: "Delivered to consignee",
        statusCode: "EOD-38",
      },
    ],
  },
  AWB1002DEL: {
    providerStatus: "In Transit",
    providerStatusType: "UD",
    deliveredAt: null,
    promisedDeliveryAt: "2026-07-31T23:59:59.000Z",
    latestScanAt: "2026-07-29T09:00:00.000Z",
    latestScanLocation: "Bangalore_Whitefield_C (Karnataka)",
    pickedUpDate: "2026-07-28T15:00:00.000Z",
    instructions: "Shipment in transit",
    scans: [
      {
        providerStatus: "In Transit",
        providerStatusType: "UD",
        providerTimestamp: "2026-07-29T09:00:00.000Z",
        scanLocation: "Bangalore_Whitefield_C (Karnataka)",
        instructions: "Shipment in transit",
        statusCode: "X-ILO",
      },
    ],
  },
  AWB_OFD: {
    providerStatus: "Dispatched",
    providerStatusType: "UD",
    latestScanAt: "2026-07-30T10:30:00.000Z",
    latestScanLocation: "Hyderabad_Madhapur_D (Telangana)",
    instructions: "Out for delivery",
  },
  AWB_RTO: {
    providerStatus: "RTO",
    providerStatusType: "DL",
    latestScanAt: "2026-07-25T11:00:00.000Z",
    latestScanLocation: "Origin Hub",
    instructions: "Returned to origin",
  },
  AWB_CANCEL: {
    providerStatus: "Cancelled",
    providerStatusType: "UD",
    latestScanAt: "2026-07-18T08:00:00.000Z",
    latestScanLocation: "Origin Hub",
  },
  AWB_UNKNOWN: {
    providerStatus: "Quantum Entangled",
    providerStatusType: "ZZ",
    latestScanAt: "2026-07-18T08:00:00.000Z",
    latestScanLocation: "Nowhere",
  },
  AWB_NOT_FOUND: {
    providerStatus: "",
    providerStatusType: "",
    syncStatus: "not_found",
    error: "AWB not found",
  },
  AWB_MALFORMED: {
    providerStatus: "",
    providerStatusType: "",
    syncStatus: "malformed",
    error: "Malformed Delhivery response",
    raw: { unexpected: true },
  },
  AWB_PARTIAL_FAIL: {
    providerStatus: "",
    providerStatusType: "",
    syncStatus: "error",
    error: "Delhivery timeout for AWB",
  },
};

function toResult(awb: string, c: FixtureCase): TrackedShipmentResult {
  if (c.syncStatus && c.syncStatus !== "ok") {
    return {
      awb,
      providerStatus: null,
      providerStatusType: null,
      normalizedStatus: "unknown",
      syncStatus: c.syncStatus,
      error: c.error,
      rawProviderPayload: c.raw,
      scans: [],
    };
  }
  const normalizedStatus = normalizeDelhiveryStatus(c.providerStatus, c.providerStatusType, {
    pickedUpDate: c.pickedUpDate,
    instructions: c.instructions,
  });
  return {
    awb,
    providerStatus: c.providerStatus,
    providerStatusType: c.providerStatusType,
    normalizedStatus,
    deliveredAt: c.deliveredAt ?? null,
    promisedDeliveryAt: c.promisedDeliveryAt ?? null,
    latestScanAt: c.latestScanAt ?? null,
    latestScanLocation: c.latestScanLocation ?? null,
    syncStatus: "ok",
    scans: c.scans ?? [],
    rawProviderPayload: {
      Shipment: {
        AWB: awb,
        Status: {
          Status: c.providerStatus,
          StatusType: c.providerStatusType,
          StatusDateTime: c.latestScanAt,
          StatusLocation: c.latestScanLocation,
          Instructions: c.instructions,
        },
        DeliveryDate: c.deliveredAt,
        PickedupDate: c.pickedUpDate,
        PromisedDeliveryDate: c.promisedDeliveryAt,
      },
    },
  };
}

export type FixtureDelhiveryOptions = {
  /** AWBs that should fail even if a happy case exists */
  failAwbs?: string[];
  /** Override map */
  cases?: Record<string, FixtureCase>;
  /** Simulate hard connector failure */
  failHard?: boolean;
  failHardMessage?: string;
};

/**
 * Deterministic Delhivery tracking for tests — never calls the live API.
 */
export class FixtureDelhiveryConnector implements DelhiveryConnector {
  private readonly options: FixtureDelhiveryOptions;

  constructor(options: FixtureDelhiveryOptions = {}) {
    this.options = options;
  }

  async trackShipments(awbNumbers: string[]): Promise<TrackedShipmentResult[]> {
    if (this.options.failHard) {
      throw new Error(this.options.failHardMessage || "Delhivery API unavailable");
    }
    const unique = dedupeAwbs(awbNumbers);
    const cases = { ...CASES, ...this.options.cases };
    const failSet = new Set(this.options.failAwbs ?? []);

    return unique.map((awb) => {
      if (failSet.has(awb)) {
        return {
          awb,
          providerStatus: null,
          providerStatusType: null,
          normalizedStatus: "unknown" as const,
          syncStatus: "error" as const,
          error: "Partial batch failure",
          scans: [],
        };
      }
      const c = cases[awb];
      if (!c) {
        return {
          awb,
          providerStatus: null,
          providerStatusType: null,
          normalizedStatus: "unknown" as const,
          syncStatus: "not_found" as const,
          error: "AWB not found",
          scans: [],
        };
      }
      return toResult(awb, c);
    });
  }
}
