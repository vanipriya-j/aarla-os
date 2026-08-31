import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import { eventFingerprint, normalizeDelhiveryStatus } from "@/lib/adapters/delhivery/normalize";
import type {
  NormalizedShipmentStatus,
  Shipment,
  ShipmentCarrier,
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
      const payloadJson =
        input.rawProviderPayload == null
          ? null
          : JSON.stringify(input.rawProviderPayload);

      if (!input.applyTrackingUpdate) {
        // Failure / not_found: one round-trip — only touch sync metadata.
        const rows = await q(
          `insert into shipments (
             organization_id, external_order_id, external_fulfilment_id, carrier, awb,
             provider_status, provider_status_type, normalized_status,
             delivered_at, latest_scan_at, latest_scan_location,
             sync_status, sync_error, raw_provider_payload, last_synced_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
           on conflict (organization_id, carrier, awb) do update set
             sync_status = excluded.sync_status,
             sync_error = excluded.sync_error,
             external_order_id = coalesce(excluded.external_order_id, shipments.external_order_id),
             external_fulfilment_id = coalesce(excluded.external_fulfilment_id, shipments.external_fulfilment_id),
             last_synced_at = now()
           returning *, (xmax = 0) as inserted`,
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
            payloadJson,
          ],
        );
        return {
          id: String(rows[0]!.id),
          created: Boolean((rows[0] as { inserted?: boolean }).inserted),
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
         on conflict (organization_id, carrier, awb) do update set
           external_order_id = coalesce(excluded.external_order_id, shipments.external_order_id),
           external_fulfilment_id = coalesce(excluded.external_fulfilment_id, shipments.external_fulfilment_id),
           provider_status = excluded.provider_status,
           provider_status_type = excluded.provider_status_type,
           normalized_status = case
             when shipments.normalized_status = 'delivered'
               and excluded.normalized_status = 'unknown'
             then shipments.normalized_status
             else excluded.normalized_status
           end,
           delivered_at = case
             when shipments.normalized_status = 'delivered'
               and excluded.normalized_status = 'unknown'
             then shipments.delivered_at
             else coalesce(excluded.delivered_at, shipments.delivered_at)
           end,
           latest_scan_at = excluded.latest_scan_at,
           latest_scan_location = excluded.latest_scan_location,
           sync_status = excluded.sync_status,
           sync_error = excluded.sync_error,
           raw_provider_payload = excluded.raw_provider_payload,
           last_synced_at = now()
         returning *, (xmax = 0) as inserted`,
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
          payloadJson,
        ],
      );
      return {
        id: String(rows[0]!.id),
        created: Boolean((rows[0] as { inserted?: boolean }).inserted),
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

    async listDiagnostics(options = {}) {
      const pageSize = Math.min(Math.max(Math.floor(options.pageSize ?? 50), 1), 100);
      const page = Math.max(Math.floor(options.page ?? 1), 1);

      const countRows = await q<{ c: string }>(
        `select count(*)::text as c from shipments where organization_id = $1`,
        [ORG_ID],
      );
      const total = Number(countRows[0]?.c ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * pageSize;

      const rows = await q(
        `select s.*,
                o.order_number,
                o.order_date,
                c.name as customer_name
         from shipments s
         left join external_orders o on o.id = s.external_order_id
         left join external_customers c on c.id = o.external_customer_id
         where s.organization_id = $1
         order by s.last_synced_at desc, s.awb
         limit $2 offset $3`,
        [ORG_ID, pageSize, total === 0 ? 0 : offset],
      );

      return {
        rows: rows.map((r) => {
          const s = mapShipment(r);
          return {
            id: s.id,
            awb: s.awb,
            orderNumber: r.order_number == null ? null : String(r.order_number),
            customerName:
              r.customer_name == null || String(r.customer_name).trim() === ""
                ? null
                : String(r.customer_name),
            orderedAt: isoOrNull(r.order_date),
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
        }),
        total,
        page: total === 0 ? 1 : safePage,
        pageSize,
        totalPages: total === 0 ? 1 : totalPages,
      };
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
