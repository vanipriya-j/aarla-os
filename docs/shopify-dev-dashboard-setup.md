# Shopify Dev Dashboard setup for Aarla OS

## What Aarla OS needs

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_CLIENT_ID=…
SHOPIFY_CLIENT_SECRET=…
SHOPIFY_API_VERSION=2025-01
```

Optional legacy override: `SHOPIFY_ADMIN_API_ACCESS_TOKEN`.

## Steps in the Dev Dashboard (you)

1. Open [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard/) → app **aarla-os**.
2. Ensure scopes include `read_customers`, `read_orders`, `read_all_orders`.
   - Match `shopify.app.toml` in this repo, or create a new version with those scopes and **Release**.
3. On Overview, click **Install app** on the Aarla store.
   - Confirm **Installs ≥ 1**.
4. Open **Settings** → copy **Client ID** and **Client secret**.
5. Add the three env vars on Vercel (Production + Preview as needed) and redeploy.

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
