# Customer Calls

Founder outreach queues for Vyshali. Shopify + Delhivery sync into `external_*` and `shipments`; **Refresh call queues** (also runs after Sync All) builds live queue rows from that local data.

## Queues

1. **Delivery Follow-up** — Delhivery `normalized_status = delivered` within the last 120 days (phone from Shopify customer profile, default address, or order shipping/billing; rows still appear if none is available)  
2. **Re-engagement — No Purchase in 90 Days** — `latest_valid_order_at` older than the segment cooldown (default 90 days), with a phone number  
3. **Abandoned Cart** — Shopify abandoned checkouts (`external_abandoned_checkouts`) not yet completed/recovered, within the segment lookback (default 7 days), with a phone number  
4. **Live carts** (pixel) — Active / anonymous abandoned / identified abandoned / recovered counts from `cart_sessions` (Web Pixel). Demand signal only — **no** inventory holds. Founder can open recovery URL, mark recovered, or **Enqueue identified → Abandoned Cart queue** (`source_key = cartsession:{sessionId}`). Skips anonymous (no phone), consent deny, and DNC. Does **not** auto-send WhatsApp/email.

Do Not Contact preferences exclude customers. Completed / in-progress / call-later rows are preserved. **Skipped** rows that are still eligible are re-opened on **Refresh call queues**. When synced commerce exists, demo/seed pending rows are cleared so Meera Iyer cannot mask live data.

### Abandoned Cart — due diligence

Before an abandoned checkout enters the queue, generation double-checks the founder isn't about to
call someone who already bought: it excludes any checkout whose customer has a **valid Shopify
order placed within the same lookback window** (default 7 days), matched by external customer id,
phone, or email (whichever the checkout has on file). A checkout is also skipped once it has
`completed_at` or `converted_order_external_id` set, or once a **completed** abandoned-cart queue
item already exists for it (`source_key = 'abandoned:' || external_id`) — so a founder marking
**Already Purchased** (optionally linking the Shopify order id/number) or Shopify itself completing
the checkout both permanently retire that opportunity. Checkouts with no phone on file are excluded
entirely — there is no "Phone missing" placeholder for this segment.

## UI stages

`/customer-calls` uses one stage tab at a time:

1. **Shopify** — Sync All / Shopify sync + customer diagnostics table  
2. **Shipments** — Delhivery sync of **all** AWBs in the database (not capped to the last Shopify page of 25) + shipment details table  
3. **Delivery Follow-up** — live call queue for recent deliveries  
4. **Re-engagement** — live call queue for 90-day lapse  
5. **Abandoned Cart** — live call queue for uncompleted Shopify checkouts  
6. **Live carts** — pixel cart sessions panel (Active / Abandoned / Recovered); enqueue identified into Abandoned Cart queue without auto-send

**Sync All** runs Shopify orders, then Shopify abandoned checkouts, then Delhivery, serially under one lock token.

Web Pixel setup: `docs/shopify-web-pixel.md`.

## Architecture

```
UI /customer-calls
  → refreshCustomerCallQueues (local Postgres eligibility)
  → customer-calls-actions
    → CustomerCallsEngine
      → customer_* Postgres tables
```

Commerce sync does **not** invent queue rows by itself; generation reads already-synced Shopify + Delhivery tables.

## After deploy

1. Run `/setup` Initialize (or `db:migrate` + `db:seed`) so segments exist.  
2. Open **Shipments** → **Sync Delhivery Shipments** (or **Sync All**) and let it finish all AWB chunks.  
3. Open **Delivery Follow-up** → **Refresh call queues** (also backfills missing phones for those delivered orders only — no full Shopify re-upload).  
4. If you still see Meera Iyer / demo names, click **Refresh call queues** once after this deploy — demo rows are cleared whenever synced shipments exist.
