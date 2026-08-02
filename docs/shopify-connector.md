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

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_…
SHOPIFY_API_VERSION=2025-01
```

Never use `NEXT_PUBLIC_` for these values.

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
