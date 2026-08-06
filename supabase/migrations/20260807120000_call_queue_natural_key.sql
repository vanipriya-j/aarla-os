-- Idempotent live call-queue upserts via explicit source_key.
-- Delivery: delivery:{shopifyCustomerId}:{orderNumber}
-- Re-engagement: reeng:{shopifyCustomerId}
-- Legacy seed rows get a stable legacy:{id} key so the unique index can apply.

alter table customer_call_queue_items
  add column if not exists source_key text;

update customer_call_queue_items
set source_key = 'legacy:' || id::text
where source_key is null;

alter table customer_call_queue_items
  alter column source_key set not null;

create unique index if not exists customer_call_queue_source_key_uidx
  on customer_call_queue_items (organization_id, segment_id, source_key);
