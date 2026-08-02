# Shopify connector (Customer Calls commerce sync)

Server-side GraphQL Admin sync that stores normalized commerce references in Aarla OS.

## Ownership

| Shopify (external channel) | Aarla OS |
|----------------------------|----------|
| Customers, orders, line items, fulfilments, tracking | Synced `external_*` records, call segments, interactions, contact preferences, queue state |

## Architecture

```
UI Sync Shopify Data
  → shopify-sync-actions (server)
    → syncShopifyCustomerCallData()
      → ShopifyConnector (live | fixture)
      → ExternalCommerceRepository → Postgres
```

React components never call Shopify Admin APIs.

## Scopes

- `read_customers`
- `read_orders`
- Prefer `read_all_orders` (without it, history is limited to ~60 days)

## Environment (server-only)

**Preferred — Shopify Dev Dashboard (client credentials):**

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_CLIENT_ID=…
SHOPIFY_CLIENT_SECRET=…
SHOPIFY_API_VERSION=2025-01
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

## Out of scope

- Delhivery tracking API
- Final call-segment eligibility rules
- Queue generation / refresh
- AI / RAG
