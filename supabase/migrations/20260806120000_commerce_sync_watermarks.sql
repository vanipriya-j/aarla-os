-- Watermarks for incremental commerce sync (Shopify orders, etc.)

create table commerce_sync_watermarks (
  channel text primary key check (channel in ('shopify_orders')),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Committed high-water: only orders after this are fetched on incremental sync
  watermark_at timestamptz,
  -- In-flight run tracking so we only commit after the final chunk
  run_id text,
  run_high_water_at timestamptz,
  updated_at timestamptz not null default now()
);

create index commerce_sync_watermarks_org_idx
  on commerce_sync_watermarks(organization_id);
