# Delhivery shipment connector

Server-side Pull tracking API that normalizes Delhivery scan status into Aarla OS `shipments`.

## Flow

```
Shopify external_fulfilments (AWB)
  → syncDelhiveryShipments()
    → DelhiveryConnector.trackShipments()
    → shipments + shipment_status_events
```

Does **not** create Customer Call queue items.

## Environment (server-only)

```
DELHIVERY_API_TOKEN=
DELHIVERY_API_BASE_URL=https://track.delhivery.com   # optional
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
