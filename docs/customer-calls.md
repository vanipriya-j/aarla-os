# Customer Calls

Founder outreach queues for Vyshali — seeded demo data only (no Shopify / Delhivery yet).

## Queues

1. **Delivery Follow-up** — post-delivery experience check  
2. **Re-engagement — No Purchase in 90 Days** — warm seasonal outreach  

## Architecture

```
UI /customer-calls
  → customer-calls-actions
    → CustomerCallsEngine
      → customer_* Postgres tables
```

Do Not Contact preferences exclude customers from active queues.

## After deploy

Run `/setup` Initialize (or `db:migrate` + `db:seed`) so segments and queue rows exist.
