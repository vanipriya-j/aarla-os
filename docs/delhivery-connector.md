# Delhivery shipment connector

Server-side Pull tracking API that normalizes Delhivery scan status into Aarla OS `shipments`.

## Flow

```
Shopify external_fulfilments (AWB)
  → POST /api/commerce/sync/delhivery
    → syncDelhiveryShipments({ offset })   # chunked (~10 AWBs / call)
      → DelhiveryConnector.trackShipments()
      → shipments + shipment_status_events
```

Does **not** create Customer Call queue items directly — run **Refresh call queues** (or Sync All) so delivery follow-ups are built from `shipments.normalized_status = delivered`.

Commerce sync on `/customer-calls` is **manual and serial**:
- Nothing starts on page load (no auto sync, no auto diagnostics).
- Shopify and Delhivery share one lock — if a sync is in progress, another will not start.
- Prefer **Sync All (Shopify → Delhivery)** for a full serial run.

## Environment (server-only)

```
DELHIVERY_API_TOKEN=
DELHIVERY_API_BASE_URL=https://track.delhivery.com   # optional
DELHIVERY_SYNC_MAX_AWBS=10                           # optional chunk size
DELHIVERY_USE_FIXTURE=1                              # local/e2e only
```

Auth: `Authorization: Token <DELHIVERY_API_TOKEN>`  
Endpoint: `GET /api/v1/packages/json/?waybill=awb1,awb2&verbose=2` (max 30 AWBs)

## Status mapping

| StatusType | Status | Normalized |
|------------|--------|------------|
| UD | Manifested / Not Picked | `manifested` (or `picked-up` if PickedupDate set) |
| UD | In Transit / Pending / Scheduled | `in-transit` |
| UD | Dispatched | `out-for-delivery` |
| DL | Delivered | `delivered` |
| RT | * | `returned` |
| DL | RTO / DTO | `returned` |
| * | Cancelled | `cancelled` |
| — | unrecognized | `unknown` |

Never infer `delivered` from Shopify fulfilment status.  
Failed lookups update `sync_status` / `sync_error` only — previous valid status remains.
