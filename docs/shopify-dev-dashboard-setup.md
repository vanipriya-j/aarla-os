# Shopify Dev Dashboard setup for Aarla OS

## What Aarla OS needs

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_CLIENT_ID=…
SHOPIFY_CLIENT_SECRET=…
SHOPIFY_API_VERSION=2025-01
```

Optional (recommended for inventory Sync): `SHOPIFY_AARLA_OFFICE_LOCATION_ID=gid://shopify/Location/…`
(Aarla Office). With this set, qty reads use `inventoryLevel(locationId:)` and only need `read_inventory`.

Optional legacy fallback: `SHOPIFY_ADMIN_API_ACCESS_TOKEN`. Prefer client credentials — a stale
`shpat_` token often lacks newly added scopes (e.g. `read_locations`) even when the Dashboard lists them.
If both are set, Aarla uses client credentials first.

## Steps in the Dev Dashboard (you)

1. Open [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard/) → app **aarla-os**.
2. Ensure scopes include `read_customers`, `read_orders`, `read_all_orders`, plus for inventory Sync:
   `read_inventory` and `read_locations` (Location object fields require `read_locations` since Admin API 2024-07).
   - Match `shopify.app.toml` in this repo, or create a new version with those scopes and **Release**.
3. On Overview, click **Install app** on the Aarla store (re-approve after scope changes).
   - Confirm **Installs ≥ 1**.
4. Open **Settings** → copy **Client ID** and **Client secret**.
5. Add the env vars on Vercel (Production + Preview as needed). Clear any stale
   `SHOPIFY_ADMIN_API_ACCESS_TOKEN` if you rely on client credentials, then redeploy.

## CLI helpers (local machine)

```bash
npm run shopify:auth      # browser login — must run on your machine
npm run shopify:link      # link shopify.app.toml to the Dev Dashboard app
npm run shopify:deploy    # release config/scopes if linked
```

Cloud agents cannot complete `shopify auth login` for you (interactive browser + your account).

## Verify

1. `/customer-calls` → **Sync Shopify Data**
2. Diagnostics should show customers / AWBs
3. Then **Sync Delhivery Shipments** (needs `DELHIVERY_API_TOKEN`)

## Common errors

| Error | Fix |
|-------|-----|
| credentials missing | Set Client ID + Secret + store domain |
| `shop_not_permitted` | App and store must be in the same Dev Dashboard organization |
| HTTP 401 on GraphQL | App not installed, or scopes not approved |
| Empty / short order history | Add `read_all_orders` and re-approve install |
| `Access denied for locations field` | Since API 2024-07, Location fields need `read_locations` on the **live** token. Reinstall/approve the app, remove stale `SHOPIFY_ADMIN_API_ACCESS_TOKEN`, or set `SHOPIFY_AARLA_OFFICE_LOCATION_ID` and use the qty-only path |
| Dashboard shows scope but probe does not | Token was minted before the scope was added — use client credentials or reinstall |

## Verify inventory scopes

Diagnostics → **Probe Shopify** — check live `accessScopes` includes `read_locations`, and that the locations query succeeds. Or set `SHOPIFY_AARLA_OFFICE_LOCATION_ID` so Sync never needs that query.
