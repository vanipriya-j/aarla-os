# Delhivery shipment connector

Server-side Delhivery integration for **tracking** (Shipments / Customer Calls) and **AWB create + packing slip** (Fulfil).

## Tracking flow

```
Shopify external_fulfilments (AWB)
  → POST /api/commerce/sync/delhivery
    → syncDelhiveryShipments({ offset })   # chunked (~25 AWBs / call)
      → DelhiveryConnector.trackShipments()
      → shipments + shipment_status_events
```

Does **not** create Customer Call queue items directly — run **Refresh call queues** (or Sync All) so delivery follow-ups are built from `shipments.normalized_status = delivered`.

Commerce sync on `/customer-calls` is **manual and serial**:
- Nothing starts on page load (no auto sync, no auto diagnostics).
- Shopify and Delhivery share one lock — if a sync is in progress, another will not start.
- Prefer **Sync All (Shopify → Delhivery)** for a full serial run.
- Delhivery tracks **every** fulfilment AWB already in Postgres (blank Shopify `tracking.company` still counts) — not only the last Shopify GraphQL page of 25 orders.

## AWB create + print label (Fulfil)

```
Fulfil order
  → Check Surface / Express rates
      → GET /api/kinko/v1/invoice/charges/.json  (md=S|E, o_pin, d_pin, cgm)
  → Pick cheaper / preferred mode → save shipping method (+ approx courier cost)
  → Generate AWB
      → POST /api/cmu/create.json  (pickup_location + shipment)
      → save AWB on fulfilment_orders
  → Print label
      → GET /api/fulfil/:id/delhivery-label
          → GET /api/p/packing_slip?wbns=AWB&pdf=true&pdf_size=4R
          → official Delhivery shipping-label PDF (barcode) when account returns pdf_download_link
          → else HTML Code 128 packing slip fallback
```

Requires a synced Shopify shipping address on `external_orders` (`shipping_name`, `shipping_address1`, city, province, zip, phone). Re-sync Shopify orders after deploy so open Fulfil rows get addresses.

Rate lookup needs `DELHIVERY_PICKUP_PIN` (origin). Charges are approximate (`total_amount`); actual billed amount can differ.

Payment mode: Shopify `PAID` → Prepaid (`Pre-paid` in Delhivery API); otherwise COD with order total.

## Today's Dispatch batch

On **Fulfil → Today's Dispatch**:
- **Print labels (2 / A4)** — downloads an A4 PDF with two official Delhivery shipping labels per page (`/api/fulfil/delhivery-labels-a4`)
- **Schedule Delhivery pickup** — `POST /fm/request/new/` with warehouse name, date, time, and expected package count

Pickup requires `DELHIVERY_PICKUP_NAME` to match the registered warehouse exactly.


## Environment (server-only)

```
DELHIVERY_API_TOKEN=
DELHIVERY_API_BASE_URL=https://track.delhivery.com   # optional
DELHIVERY_SYNC_MAX_AWBS=25                           # optional chunk size (max 40)
DELHIVERY_PICKUP_NAME=                               # required for AWB create (registered warehouse name)
DELHIVERY_PICKUP_PIN=                                # required for Surface/Express rate lookup (origin)
DELHIVERY_PICKUP_ADDRESS=
DELHIVERY_PICKUP_CITY=
DELHIVERY_PICKUP_STATE=
DELHIVERY_PICKUP_PHONE=
DELHIVERY_DEFAULT_WEIGHT_G=500
DELHIVERY_USE_FIXTURE=1                              # local/e2e only
```

Auth: `Authorization: Token <DELHIVERY_API_TOKEN>`  
Tracking: `GET /api/v1/packages/json/?waybill=awb1,awb2&verbose=2` (max 30 AWBs)  
Create: `POST /api/cmu/create.json` with `format=json&data=<json>`  
Rates: `GET /api/kinko/v1/invoice/charges/.json?md=S|E&cgm=&o_pin=&d_pin=&ss=Delivered`  
Packing slip / label: `GET /api/p/packing_slip?wbns=<awb>&pdf=true&pdf_size=4R` (official PDF when supported; otherwise JSON → HTML Code 128)

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
