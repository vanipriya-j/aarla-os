-- Abandoned checkouts (Shopify) → Aarla AbandonedCommerceOpportunity
-- + Customer Calls segment abandoned-cart
-- Idempotent for /setup and runtime ensure.

-- ---------------------------------------------------------------------------
-- External abandoned checkouts
-- ---------------------------------------------------------------------------
create table if not exists external_abandoned_checkouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  external_id text not null,
  external_customer_id text,
  customer_name text not null default '',
  phone text,
  email text,
  checkout_url text,
  subtotal numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  last_activity_at timestamptz not null,
  completed_at timestamptz,
  converted_order_external_id text,
  shopify_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);
create index if not exists external_abandoned_checkouts_org_idx
  on external_abandoned_checkouts(organization_id);
create index if not exists external_abandoned_checkouts_activity_idx
  on external_abandoned_checkouts(organization_id, last_activity_at desc);
create index if not exists external_abandoned_checkouts_customer_idx
  on external_abandoned_checkouts(organization_id, external_customer_id)
  where external_customer_id is not null;
create trigger external_abandoned_checkouts_updated_at
  before update on external_abandoned_checkouts
  for each row execute function set_updated_at();

create table if not exists external_abandoned_checkout_items (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references external_abandoned_checkouts(id) on delete cascade,
  external_line_item_id text not null,
  external_product_id text,
  external_variant_id text,
  title text not null default '',
  variant_title text,
  quantity integer not null default 1 check (quantity >= 0),
  unit_price numeric(12, 2) not null default 0,
  unique (checkout_id, external_line_item_id)
);
create index if not exists external_abandoned_checkout_items_checkout_idx
  on external_abandoned_checkout_items(checkout_id);

-- ---------------------------------------------------------------------------
-- Queue display fields for abandoned-cart rows
-- ---------------------------------------------------------------------------
alter table customer_call_queue_items
  add column if not exists checkout_url text;
alter table customer_call_queue_items
  add column if not exists cart_subtotal numeric(12, 2);
alter table customer_call_queue_items
  add column if not exists cart_currency text;

-- ---------------------------------------------------------------------------
-- Segment type: abandoned-cart
-- ---------------------------------------------------------------------------
alter table customer_call_segments drop constraint if exists customer_call_segments_segment_type_check;
alter table customer_call_segments
  add constraint customer_call_segments_segment_type_check
  check (segment_type in ('delivery-follow-up', 're-engagement', 'abandoned-cart'));

-- ---------------------------------------------------------------------------
-- Watermark channel for abandoned checkouts
-- ---------------------------------------------------------------------------
alter table commerce_sync_watermarks drop constraint if exists commerce_sync_watermarks_channel_check;
alter table commerce_sync_watermarks
  add constraint commerce_sync_watermarks_channel_check
  check (channel in ('shopify_orders', 'shopify_abandoned_checkouts'));
