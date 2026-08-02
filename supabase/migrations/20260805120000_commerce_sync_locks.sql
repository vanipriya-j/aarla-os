-- Global lock so Shopify and Delhivery syncs never run in parallel.
-- Client passes a holder token across chunks; stale locks expire after 15 minutes.

create table commerce_sync_locks (
  id text primary key check (id = 'global'),
  holder text not null,
  channel text not null check (channel in ('shopify', 'delhivery', 'commerce')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
