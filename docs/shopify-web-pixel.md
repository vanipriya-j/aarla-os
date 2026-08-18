# Shopify Web Pixel → Aarla OS cart funnel

Live cart / checkout demand signal for Customer Calls **Live carts** and Campaign
**Commerce funnel**. Events land in `commerce_events` (+ `cart_sessions` when
materialized). **Never** writes `stock_movements` or soft `channel_reservations`.

## After PR 8 merge

1. One clean setup (demo off) **or** run `supabase/aarla-os-complete.sql` on an empty DB.
2. Deploy / enable the pixel (extension **or** Custom Pixel fallback below).
3. Re-sync Shopify orders/abandoned checkouts as usual (`docs/shopify-connector.md`).

## Auth

Server env (same secret as Shopify Reserve):

```
SHOPIFY_INTEGRATION_SECRET=…   # long random
```

Ingest URL:

```
POST https://<aarla-host>/api/integrations/shopify/commerce-events
Authorization: Bearer <SHOPIFY_INTEGRATION_SECRET>
Content-Type: application/json
```

Path is public to cookie auth (machine callers) but gated by the secret.

## Option A — App Web Pixel extension

Folder: `extensions/aarla-commerce-pixel/`

```bash
npx shopify auth login
npx shopify app config link
npx shopify app deploy
```

Then in Shopify admin → app extension settings for **aarla-commerce-pixel**:

| Setting    | Value |
|------------|--------|
| `ingestUrl` | `https://<aarla-host>/api/integrations/shopify/commerce-events` |
| `secret`    | same as `SHOPIFY_INTEGRATION_SECRET` |

Subscribed events: `product_viewed`, `product_added_to_cart`,
`product_removed_from_cart`, `cart_viewed`, `checkout_started`,
`checkout_contact_info_submitted`, `checkout_address_info_submitted`,
`checkout_shipping_info_submitted`, `checkout_payment_info_submitted`,
`checkout_completed`.

## Option B — Custom Pixel paste (fallback)

Shopify Admin → Settings → Customer events → Add custom pixel. Paste:

```javascript
// Aarla OS cart funnel — Custom Pixel fallback
// Replace INGEST_URL and SECRET before saving.
const INGEST_URL = "https://YOUR_AARLA_HOST/api/integrations/shopify/commerce-events";
const SECRET = "YOUR_SHOPIFY_INTEGRATION_SECRET";

const EVENTS = [
  "product_viewed",
  "product_added_to_cart",
  "product_removed_from_cart",
  "cart_viewed",
  "checkout_started",
  "checkout_contact_info_submitted",
  "checkout_address_info_submitted",
  "checkout_shipping_info_submitted",
  "checkout_payment_info_submitted",
  "checkout_completed",
];

analytics.subscribe("all_standard_events", (event) => {
  if (!EVENTS.includes(event.name)) return;
  fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + SECRET,
    },
    body: JSON.stringify({
      name: event.name,
      eventType: event.name,
      id: event.id,
      timestamp: event.timestamp,
      data: event.data,
      context: event.context,
    }),
    keepalive: true,
  }).catch(() => {});
});
```

Connect the pixel to your storefront and publish. Prefer sandbox / privacy settings
that still allow first-party fetch to your Aarla host.

## Optional UTM → campaign mapping

Insert rows into `campaign_utm_mappings` (`organization_id`, `utm_campaign`, `campaign_id`)
so pixel `utm_campaign` values attach to a planner campaign for LIVE funnel counts.

## Thresholds (code constants; env overrides)

| State | Default |
|-------|---------|
| ACTIVE | inactivity &lt; 30 min (`CART_ABANDON_AFTER_MINUTES`) |
| ABANDONED | ≥ 30 min with items |
| EXPIRED | 30 days (`CART_EXPIRE_AFTER_DAYS`) |

## Out of scope

- Auto WhatsApp / email / RAG outreach
- Auto cart soft-reservations
- Replacing #32 abandoned-checkout Admin sync (still used; pixel **extends** it)
