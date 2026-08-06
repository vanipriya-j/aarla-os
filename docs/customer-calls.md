# Customer Calls

Founder outreach queues for Vyshali. Shopify + Delhivery sync into `external_*` and `shipments`; **Refresh call queues** (also runs after Sync All) builds live queue rows from that local data.

## Queues

1. **Delivery Follow-up** — Delhivery `normalized_status = delivered` within the last 120 days (phone preferred; rows still appear if Shopify phone is missing)  
2. **Re-engagement — No Purchase in 90 Days** — `latest_valid_order_at` older than the segment cooldown (default 90 days), with a phone number  

Do Not Contact preferences exclude customers. Completed / in-progress / call-later / skipped rows are preserved. When synced commerce exists, demo/seed pending rows are cleared so Meera Iyer cannot mask live data.

## UI stages

`/customer-calls` uses one stage tab at a time:

1. **Shopify** — Sync All / Shopify sync + customer diagnostics table  
2. **Shipments** — Delhivery sync of **all** AWBs in the database (not capped to the last Shopify page of 25) + shipment details table  
3. **Delivery Follow-up** — live call queue for recent deliveries  
4. **Re-engagement** — live call queue for 90-day lapse  

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
2. **Sync All (Shopify → Delhivery)** on `/customer-calls`.  
3. Queues rebuild automatically after sync (or click **Refresh call queues**).  
4. If you still see Meera Iyer / demo names, click **Refresh call queues** once after this deploy — demo rows are cleared whenever synced commerce is present.
