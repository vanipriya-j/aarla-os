-- External commerce references (Shopify connector → Aarla OS)
-- Shopify remains an external channel. Aarla OS owns synced references.
-- Does not mutate customer_interactions or customer_contact_preferences.

create table external_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  external_id text not null,
  name text not null default '',
  phone text,
  email text,
  marketing_consent_status text,
  latest_valid_order_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);
create index external_customers_org_idx on external_customers(organization_id);
create index external_customers_latest_order_idx
  on external_customers(organization_id, latest_valid_order_at desc nulls last);
create trigger external_customers_updated_at before update on external_customers
for each row execute function set_updated_at();

create table external_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  external_id text not null,
  order_number text not null default '',
  external_customer_id uuid references external_customers(id) on delete set null,
  order_date timestamptz not null,
  financial_status text,
  fulfilment_status text,
  cancelled_at timestamptz,
  is_test boolean not null default false,
  is_valid boolean not null default true,
  exclusion_reason text
    check (
      exclusion_reason is null
      or exclusion_reason in ('cancelled', 'test', 'fully_refunded', 'no_customer')
    ),
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);
create index external_orders_org_idx on external_orders(organization_id);
create index external_orders_customer_idx on external_orders(external_customer_id);
create index external_orders_valid_idx
  on external_orders(organization_id, is_valid, order_date desc);
create trigger external_orders_updated_at before update on external_orders
for each row execute function set_updated_at();

create table external_order_items (
  id uuid primary key default gen_random_uuid(),
  external_order_id uuid not null references external_orders(id) on delete cascade,
  external_line_item_id text not null,
  external_product_id text,
  external_variant_id text,
  title text not null default '',
  variant_title text,
  quantity integer not null default 1 check (quantity >= 0),
  unit_price numeric(12, 2) not null default 0,
  unique (external_order_id, external_line_item_id)
);
create index external_order_items_order_idx on external_order_items(external_order_id);

create table external_fulfilments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  external_id text not null,
  external_order_id uuid not null references external_orders(id) on delete cascade,
  tracking_company text,
  tracking_number text,
  tracking_url text,
  fulfilment_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);
create index external_fulfilments_org_idx on external_fulfilments(organization_id);
create index external_fulfilments_order_idx on external_fulfilments(external_order_id);
create index external_fulfilments_awb_idx
  on external_fulfilments(organization_id)
  where tracking_number is not null;
create trigger external_fulfilments_updated_at before update on external_fulfilments
for each row execute function set_updated_at();
