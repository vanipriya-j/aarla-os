/**
 * Live Delhivery package tracking connector — SERVER ONLY.
 * Never import from React client components.
 */

import type { DelhiveryConnector, TrackedScan, TrackedShipmentResult } from "./port";
import { chunkAwbs, dedupeAwbs, normalizeDelhiveryStatus } from "./normalize";

export type LiveDelhiveryConfig = {
  apiToken: string;
  baseUrl: string;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "LiveDelhiveryTrackingConnector must not run in the browser. Use server actions only.",
    );
  }
}

export function readLiveDelhiveryConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LiveDelhiveryConfig | null {
  const apiToken = env.DELHIVERY_API_TOKEN?.trim();
  if (!apiToken) return null;
  const baseUrl = (
    env.DELHIVERY_API_BASE_URL?.trim() || "https://track.delhivery.com"
  ).replace(/\/$/, "");
  return { apiToken, baseUrl };
}

type RawShipment = {
  AWB?: string;
  DeliveryDate?: string | null;
  PickedupDate?: string | null;
  Status?: {
    Status?: string;
    StatusType?: string;
    StatusDateTime?: string;
    StatusLocation?: string;
    Instructions?: string;
    StatusCode?: string;
  };
  Scans?: Array<{
    ScanDetail?: {
      Scan?: string;
      ScanType?: string;
      StatusDateTime?: string;
      ScanDateTime?: string;
      ScannedLocation?: string;
      Instructions?: string;
      StatusCode?: string;
    };
  }>;
};

type TrackingResponse = {
  ShipmentData?: Array<{ Shipment?: RawShipment }>;
  Error?: string;
  error?: string;
};

function mapShipment(raw: RawShipment, requestedAwb: string): TrackedShipmentResult {
  const awb = (raw.AWB ?? requestedAwb).trim();
  const status = raw.Status?.Status ?? null;
  const statusType = raw.Status?.StatusType ?? null;
  const instructions = raw.Status?.Instructions ?? null;
  const normalizedStatus = normalizeDelhiveryStatus(status, statusType, {
    pickedUpDate: raw.PickedupDate,
    instructions,
  });

  const scans: TrackedScan[] = (raw.Scans ?? []).map((s) => {
    const d = s.ScanDetail ?? {};
    return {
      providerStatus: d.Scan ?? null,
      providerStatusType: d.ScanType ?? null,
      providerTimestamp: d.StatusDateTime ?? d.ScanDateTime ?? null,
      scanLocation: d.ScannedLocation ?? null,
      instructions: d.Instructions ?? null,
      statusCode: d.StatusCode ?? null,
      rawEvent: s,
    };
  });

  const latestFromStatus = raw.Status?.StatusDateTime ?? null;
  const latestFromScans = scans
    .map((s) => s.providerTimestamp)
    .filter((t): t is string => Boolean(t))
    .sort()
    .at(-1);

  return {
    awb,
    providerStatus: status,
    providerStatusType: statusType,
    normalizedStatus,
    deliveredAt:
      normalizedStatus === "delivered"
        ? raw.DeliveryDate ?? latestFromStatus ?? null
        : null,
    latestScanAt: latestFromStatus ?? latestFromScans ?? null,
    latestScanLocation: raw.Status?.StatusLocation ?? scans.at(-1)?.scanLocation ?? null,
    syncStatus: "ok",
    scans,
    rawProviderPayload: raw,
  };
}

export class LiveDelhiveryTrackingConnector implements DelhiveryConnector {
  private readonly config: LiveDelhiveryConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LiveDelhiveryConfig, fetchImpl: typeof fetch = fetch) {
    assertServerOnly();
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private async trackBatch(awbs: string[]): Promise<TrackedShipmentResult[]> {
    assertServerOnly();
    const url = new URL(`${this.config.baseUrl}/api/v1/packages/json/`);
    url.searchParams.set("waybill", awbs.join(","));
    url.searchParams.set("verbose", "2");

    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Token ${this.config.apiToken}`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "network error";
      return awbs.map((awb) => ({
        awb,
        providerStatus: null,
        providerStatusType: null,
        normalizedStatus: "unknown" as const,
        syncStatus: "error" as const,
        error: `Delhivery request failed: ${message}`,
      }));
    }

    if (res.status === 401 || res.status === 403) {
      return awbs.map((awb) => ({
        awb,
        providerStatus: null,
        providerStatusType: null,
        normalizedStatus: "unknown" as const,
        syncStatus: "error" as const,
        error: "Invalid Delhivery API token",
      }));
    }
    if (res.status === 429) {
      return awbs.map((awb) => ({
        awb,
        providerStatus: null,
        providerStatusType: null,
        normalizedStatus: "unknown" as const,
        syncStatus: "error" as const,
        error: "Delhivery rate limit",
      }));
    }
    if (!res.ok) {
      return awbs.map((awb) => ({
        awb,
        providerStatus: null,
        providerStatusType: null,
        normalizedStatus: "unknown" as const,
        syncStatus: "error" as const,
        error: `Delhivery HTTP ${res.status}`,
      }));
    }

    let body: TrackingResponse;
    try {
      body = (await res.json()) as TrackingResponse;
    } catch {
      return awbs.map((awb) => ({
        awb,
        providerStatus: null,
        providerStatusType: null,
        normalizedStatus: "unknown" as const,
        syncStatus: "malformed" as const,
        error: "Malformed Delhivery response",
      }));
    }

    if (!Array.isArray(body.ShipmentData)) {
      const errMsg = body.Error || body.error || "No ShipmentData";
      return awbs.map((awb) => ({
        awb,
        providerStatus: null,
        providerStatusType: null,
        normalizedStatus: "unknown" as const,
        syncStatus: "not_found" as const,
        error: String(errMsg),
      }));
    }

    const byAwb = new Map<string, TrackedShipmentResult>();
    for (const row of body.ShipmentData) {
      if (!row?.Shipment) continue;
      try {
        const mapped = mapShipment(row.Shipment, row.Shipment.AWB ?? "");
        if (mapped.awb) byAwb.set(mapped.awb, mapped);
      } catch {
        /* per-row parse issues handled via missing AWB below */
      }
    }

    return awbs.map((awb) => {
      const hit = byAwb.get(awb);
      if (hit) return hit;
      return {
        awb,
        providerStatus: null,
        providerStatusType: null,
        normalizedStatus: "unknown" as const,
        syncStatus: "not_found" as const,
        error: "AWB not found",
      };
    });
  }

  async trackShipments(awbNumbers: string[]): Promise<TrackedShipmentResult[]> {
    assertServerOnly();
    const unique = dedupeAwbs(awbNumbers);
    if (!unique.length) return [];
    const results: TrackedShipmentResult[] = [];
    for (const batch of chunkAwbs(unique, 30)) {
      results.push(...(await this.trackBatch(batch)));
    }
    return results;
  }
}

export function createLiveDelhiveryConnectorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LiveDelhiveryTrackingConnector | null {
  const config = readLiveDelhiveryConfigFromEnv(env);
  if (!config) return null;
  return new LiveDelhiveryTrackingConnector(config);
}
