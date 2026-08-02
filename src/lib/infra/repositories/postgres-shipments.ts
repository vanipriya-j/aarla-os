import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import { eventFingerprint, normalizeDelhiveryStatus } from "@/lib/adapters/delhivery/normalize";
import type {
  NormalizedShipmentStatus,
  Shipment,
  ShipmentCarrier,
  ShipmentDiagnosticRow,
  ShipmentSyncStatus,
} from "@/lib/domain/shipment-types";
import type {
  AppendEventsInput,
  ShipmentRepository,
  UpsertShipmentInput,
} from "@/lib/repositories/shipments";

type Q = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return iso(value);
}

function mapShipment(r: Record<string, unknown>): Shipment {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    externalOrderId: r.external_order_id == null ? null : String(r.external_order_id),
    externalFulfilmentId:
      r.external_fulfilment_id == null ? null : String(r.external_fulfilment_id),
    carrier: r.carrier as ShipmentCarrier,
    awb: String(r.awb),
    providerStatus: r.provider_status == null ? null : String(r.provider_status),
    providerStatusType:
      r.provider_status_type == null ? null : String(r.provider_status_type),
    normalizedStatus: r.normalized_status as NormalizedShipmentStatus,
    deliveredAt: isoOrNull(r.delivered_at),
    latestScanAt: isoOrNull(r.latest_scan_at),
    latestScanLocation:
      r.latest_scan_location == null ? null : String(r.latest_scan_location),
    lastSyncedAt: iso(r.last_synced_at),
    syncStatus: r.sync_status as ShipmentSyncStatus,
    syncError: r.sync_error == null ? null : String(r.sync_error),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function createShipmentRepository(): ShipmentRepository {
  const q: Q = poolQuery;

  return {
    async listFulfilmentsWithOrders() {
      const rows = await q<{
        fulfilment_id: string;
        fulfilment_external_id: string;
        order_id: string;
        order_number: string;
        tracking_company: string | null;
        tracking_number: string | null;
        tracking_url: string | null;
      }>(
        `select f.id as fulfilment_id,
                f.external_id as fulfilment_external_id,
                o.id as order_id,
                o.order_number,
                f.tracking_company,
                f.tracking_number,
                f.tracking_url
         from external_fulfilments f
         join external_orders o on o.id = f.external_order_id
         where f.organization_id = $1
         order by f.created_at`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        fulfilmentId: r.fulfilment_id,
        fulfilmentExternalId: r.fulfilment_external_id,
        orderId: r.order_id,
        orderNumber: r.order_number,
        trackingCompany: r.tracking_company,
        trackingNumber: r.tracking_number,
        trackingUrl: r.tracking_url,
      }));
    },

    async findByCarrierAwb(carrier, awb) {
      const rows = await q(
        `select * from shipments
         where organization_id = $1 and carrier = $2 and awb = $3`,
        [ORG_ID, carrier, awb],
      );
      return rows[0] ? mapShipment(rows[0]) : null;
    },

    async upsertShipment(input: UpsertShipmentInput) {
      const existing = await q(
        `select * from shipments
         where organization_id = $1 and carrier = $2 and awb = $3`,
        [ORG_ID, input.carrier, input.awb],
      );

      if (existing[0]) {
        if (!input.applyTrackingUpdate) {
          const rows = await q(
            `update shipments
             set sync_status = $4,
                 sync_error = $5,
                 last_synced_at = now()
             where organization_id = $1 and carrier = $2 and awb = $3
             returning *`,
            [ORG_ID, input.carrier, input.awb, input.syncStatus, input.syncError],
          );
          return {
            id: String(rows[0]!.id),
            created: false,
            shipment: mapShipment(rows[0]!),
          };
        }

        // Never downgrade delivered → unknown solely because of a bad later payload
        // (caller also sets applyTrackingUpdate=false on hard failures).
        const prev = mapShipment(existing[0]);
        let normalized = input.normalizedStatus;
        let deliveredAt = input.deliveredAt;
        if (prev.normalizedStatus === "delivered" && normalized === "unknown") {
          normalized = "delivered";
          deliveredAt = prev.deliveredAt;
        }

        const rows = await q(
          `update shipments set
             external_order_id = coalesce($4, external_order_id),
             external_fulfilment_id = coalesce($5, external_fulfilment_id),
             provider_status = $6,
             provider_status_type = $7,
             normalized_status = $8,
             delivered_at = coalesce($9, delivered_at),
             latest_scan_at = $10,
             latest_scan_location = $11,
             sync_status = $12,
             sync_error = $13,
             raw_provider_payload = $14,
             last_synced_at = now()
           where organization_id = $1 and carrier = $2 and awb = $3
           returning *`,
          [
            ORG_ID,
            input.carrier,
            input.awb,
            input.externalOrderId,
            input.externalFulfilmentId,
            input.providerStatus,
            input.providerStatusType,
            normalized,
            deliveredAt,
            input.latestScanAt,
            input.latestScanLocation,
            input.syncStatus,
            input.syncError,
            input.rawProviderPayload == null
              ? null
              : JSON.stringify(input.rawProviderPayload),
          ],
        );
        return {
          id: String(rows[0]!.id),
          created: false,
          shipment: mapShipment(rows[0]!),
        };
      }

      const rows = await q(
        `insert into shipments (
           organization_id, external_order_id, external_fulfilment_id, carrier, awb,
           provider_status, provider_status_type, normalized_status,
           delivered_at, latest_scan_at, latest_scan_location,
           sync_status, sync_error, raw_provider_payload, last_synced_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
         returning *`,
        [
          ORG_ID,
          input.externalOrderId,
          input.externalFulfilmentId,
          input.carrier,
          input.awb,
          input.providerStatus,
          input.providerStatusType,
          input.normalizedStatus,
          input.deliveredAt,
          input.latestScanAt,
          input.latestScanLocation,
          input.syncStatus,
          input.syncError,
          input.rawProviderPayload == null
            ? null
            : JSON.stringify(input.rawProviderPayload),
        ],
      );
      return {
        id: String(rows[0]!.id),
        created: true,
        shipment: mapShipment(rows[0]!),
      };
    },

    async markSyncFailure(carrier, awb, syncStatus, syncError) {
      const rows = await q(
        `update shipments
         set sync_status = $4, sync_error = $5, last_synced_at = now()
         where organization_id = $1 and carrier = $2 and awb = $3
         returning *`,
        [ORG_ID, carrier, awb, syncStatus, syncError],
      );
      return rows[0] ? mapShipment(rows[0]) : null;
    },

    async appendStatusEvents(input: AppendEventsInput) {
      let inserted = 0;
      for (const scan of input.scans) {
        const fingerprint = eventFingerprint({
          awb: input.awb,
          providerStatus: scan.providerStatus,
          providerStatusType: scan.providerStatusType,
          providerTimestamp: scan.providerTimestamp,
          scanLocation: scan.scanLocation,
          statusCode: scan.statusCode,
        });
        const normalized = normalizeDelhiveryStatus(
          scan.providerStatus,
          scan.providerStatusType,
          { instructions: scan.instructions },
        );
        const rows = await q<{ id: string }>(
          `insert into shipment_status_events (
             shipment_id, provider_status, provider_status_type, normalized_status,
             provider_timestamp, scan_location, instructions, event_fingerprint, raw_event
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (shipment_id, event_fingerprint) do nothing
           returning id`,
          [
            input.shipmentId,
            scan.providerStatus,
            scan.providerStatusType,
            normalized,
            scan.providerTimestamp,
            scan.scanLocation,
            scan.instructions,
            fingerprint,
            scan.rawEvent == null ? null : JSON.stringify(scan.rawEvent),
          ],
        );
        if (rows[0]) inserted += 1;
      }
      return inserted;
    },

    async listDiagnostics(): Promise<ShipmentDiagnosticRow[]> {
      const rows = await q(
        `select s.*, o.order_number
         from shipments s
         left join external_orders o on o.id = s.external_order_id
         where s.organization_id = $1
         order by s.last_synced_at desc, s.awb`,
        [ORG_ID],
      );
      return rows.map((r) => {
        const s = mapShipment(r);
        return {
          id: s.id,
          awb: s.awb,
          orderNumber: r.order_number == null ? null : String(r.order_number),
          carrier: s.carrier,
          normalizedStatus: s.normalizedStatus,
          providerStatus: s.providerStatus,
          deliveredAt: s.deliveredAt,
          latestScanAt: s.latestScanAt,
          latestScanLocation: s.latestScanLocation,
          lastSyncedAt: s.lastSyncedAt,
          syncError: s.syncError,
          syncStatus: s.syncStatus,
        };
      });
    },

    async countByAwb(carrier, awb) {
      const rows = await q<{ c: string }>(
        `select count(*)::text as c from shipments
         where organization_id = $1 and carrier = $2 and awb = $3`,
        [ORG_ID, carrier, awb],
      );
      return Number(rows[0]?.c ?? 0);
    },
  };
}
