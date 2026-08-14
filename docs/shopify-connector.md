# Shopify connector (Customer Calls commerce sync)

Server-side GraphQL Admin sync that stores normalized commerce references in Aarla OS.

## Ownership

| Shopify (external channel) | Aarla OS |
|----------------------------|----------|
| Customers, orders, line items, fulfilments, tracking | Synced `external_*` records, call segments, interactions, contact preferences, queue state |

## Architecture

```
UI Sync Shopify Data / Sync All
  → POST /api/commerce/sync/shopify  (JSON, lock token)
    → syncShopifyCustomerCallData({ cursor })  # chunked (~100 orders / page)
      → ShopifyConnector (live | fixture)
      → ExternalCommerceRepository → Postgres
  → POST /api/commerce/sync/shopify-abandoned  (JSON, same lock token, channel "shopify")
    → syncShopifyAbandonedCheckouts({ cursor })  # chunked (~50 checkouts / page)
      → ShopifyConnector.fetchAbandonedCheckoutsPage (live | fixture)
      → ExternalCommerceRepository → Postgres (external_abandoned_checkouts + items)
```

Uses a Route Handler (not a Server Action) so Vercel timeouts return JSON instead of
Next.js “An unexpected response was received from the server.”

**Default sync is incremental:** only Shopify orders newer than the last successful
watermark are fetched. Use **Full Shopify re-sync** to walk the whole catalog again.
Abandoned checkouts follow the same incremental/full watermark pattern (own
`shopify_abandoned_checkouts` watermark channel), and run in **Sync All** right after
Shopify orders and before Delhivery, using the same sync lock token.

**Refresh call queues** runs a targeted phone backfill for delivered orders still
missing phones (fetches those order names only — not the whole catalog).

React components never call Shopify Admin APIs.

`/customer-calls` does **not** auto-sync or auto-load heavy diagnostics on page open. Shopify and Delhivery share one server lock and run serially.

## Scopes

- `read_customers`
- `read_orders` — also required for abandoned checkouts (`abandonedCheckouts` GraphQL field)
- Prefer `read_all_orders` (without it, history is limited to ~60 days)

## Environment (server-only)

**Preferred — Shopify Dev Dashboard (client credentials):**

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_CLIENT_ID=…
SHOPIFY_CLIENT_SECRET=…
SHOPIFY_API_VERSION=2025-04
```

Aarla OS exchanges Client ID/Secret for a short-lived Admin API token (~24h) and refreshes it automatically.

**Optional legacy** — static Admin API token:

```
SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_…
```

Never use `NEXT_PUBLIC_` for these values.

### Dev Dashboard setup

1. Ensure scopes include `read_customers`, `read_orders`, `read_all_orders` (see `shopify.app.toml`).
2. Install the app on the Aarla store (Installs must be ≥ 1).
3. Copy **Client ID** and **Client secret** from Dev Dashboard → Settings.
4. Set the env vars on Vercel and redeploy.

CLI helpers (local):

```bash
npx shopify auth login
npx shopify app config link
npx shopify app deploy
```

## Valid orders

Invalid / flagged (still stored when possible):

- cancelled
- test
- fully refunded
- missing customer reference

Shopify fulfilment tracking is **not** treated as proof of physical delivery.

## Soft reserve API (Shopify → Aarla OS)

WhatsApp / checkout assist on Shopify can soft-hold Studio stock without moving the ledger.

```
Shopify (server / app proxy)
  → POST /api/integrations/shopify/reservations
       Authorization: Bearer <SHOPIFY_INTEGRATION_SECRET>
       body: { externalReference, quantity, sku | productId, variantId? }
  → createShopifyReservation(...)
       → idempotent on externalReference
       → Studio available = ledger Studio − active soft holds
       → insert channel_reservations (no stock_movements)
  → response always includes continueWhatsApp: true  # fail-safe
```

### Auth (server-only)

```
SHOPIFY_INTEGRATION_SECRET=…   # long random; not the Shopify Admin token
```

Path is public to cookie auth (machine callers) but gated by this secret. Prefer
`Authorization: Bearer …` or header `x-aarla-integration-secret`.

### Request / response

- **Required:** `externalReference` (idempotent key), `quantity` (positive int), and `sku` **or** `productId` (optional `variantId`)
- **Optional:** `contactPhone`, `contactName`, `notes`, `metadata`
- **Success `200`:** `{ ok: true, data: ChannelReservation, continueWhatsApp: true }`
- **Fail soft `4xx`:** `{ ok: false, code, error, continueWhatsApp: true, … }` — Shopify should **still** continue the WhatsApp path
- Codes: `validation_error`, `product_not_found`, `insufficient_stock`

Does **not** Transfer Studio → Channel and does **not** call Shopify Inventory APIs.
Channel “reserved” in Inventory UI remains ledger qty only.

## Out of scope

- Delhivery tracking API (see `docs/delhivery-connector.md`)
- AI / RAG
- WhatsApp send provider (Shopify owns the WhatsApp UX)

Call-queue eligibility is built from synced `external_*` + `shipments` via **Refresh call queues** (see `docs/customer-calls.md`).
