-- Aarla OS canonical schema (Supabase Local / PostgreSQL)
-- Inventory quantities are NOT stored; they are derived from stock_movements.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenant
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_updated_at
before update on organizations
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  city text not null default '',
  category text not null default '',
  contact text not null default '',
  moq integer not null default 0,
  lead_time_days integer not null default 0,
  quality_rating numeric(3,1) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index vendors_org_idx on vendors(organization_id);
create trigger vendors_updated_at before update on vendors
for each row execute function set_updated_at();

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  sku text not null,
  title text not null,
  category text not null default '',
  world text not null default '',
  story text not null default '',
  selling_price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  velocity text not null default 'Steady',
  status text not null default 'Active',
  idea_origin text,
  designed_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, sku)
);
create index products_org_idx on products(organization_id);
create trigger products_updated_at before update on products
for each row execute function set_updated_at();

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  code text not null,
  label text not null,
  sku text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, sku)
);
create index product_variants_product_idx on product_variants(product_id);
create trigger product_variants_updated_at before update on product_variants
for each row execute function set_updated_at();

create table partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  partner_type text not null,
  location_label text not null default '',
  contact text not null default '',
  payment_status text not null default 'Current',
  margin numeric(5,2) not null default 0,
  merchandising_notes text not null default '',
  products_sold integer not null default 0,
  replenishment_history jsonb not null default '[]'::jsonb,
  display_photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index partners_org_idx on partners(organization_id);
create trigger partners_updated_at before update on partners
for each row execute function set_updated_at();

create table locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null check (kind in ('Studio', 'Partner', 'Channel', 'Hold', 'External')),
  partner_id uuid references partners(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index locations_org_idx on locations(organization_id);
create index locations_partner_idx on locations(partner_id);
create trigger locations_updated_at before update on locations
for each row execute function set_updated_at();

create table institutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  institution_type text not null,
  contact text not null default '',
  city text,
  orders jsonb not null default '[]'::jsonb,
  users_reached integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create trigger institutions_updated_at before update on institutions
for each row execute function set_updated_at();

create table manufacturing_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  batch_number text not null,
  product_id uuid not null references products(id),
  vendor_id uuid not null references vendors(id),
  manufacture_date date,
  received_date date,
  quantity_produced integer not null default 0,
  accepted integer not null default 0,
  damaged integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index manufacturing_batches_product_idx on manufacturing_batches(product_id);
create trigger manufacturing_batches_updated_at before update on manufacturing_batches
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Purchasing & ledger
-- ---------------------------------------------------------------------------
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  vendor_id uuid not null references vendors(id),
  product_id uuid not null references products(id),
  batch_id uuid references manufacturing_batches(id),
  quantity_ordered integer not null,
  quantity_received integer not null default 0,
  unit_cost numeric(12,2) not null default 0,
  status text not null,
  required_date date,
  ordered_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index purchase_orders_org_status_idx on purchase_orders(organization_id, status);
create trigger purchase_orders_updated_at before update on purchase_orders
for each row execute function set_updated_at();

-- Append-only stock movements. Business columns must not be updated after insert.
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  movement_date date not null,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  batch_id uuid references manufacturing_batches(id),
  quantity integer not null check (quantity > 0),
  from_location_id uuid not null references locations(id),
  to_location_id uuid not null references locations(id),
  movement_type text not null,
  reference text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index stock_movements_org_product_idx on stock_movements(organization_id, product_id);
create index stock_movements_org_from_idx on stock_movements(organization_id, from_location_id);
create index stock_movements_org_to_idx on stock_movements(organization_id, to_location_id);
create index stock_movements_org_ref_idx on stock_movements(organization_id, reference);
create index stock_movements_org_date_idx on stock_movements(organization_id, movement_date);

-- Prevent updates/deletes of committed movement business data
create or replace function prevent_stock_movement_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_movements are immutable after commit; use compensating movements';
end;
$$;

create trigger stock_movements_no_update
before update on stock_movements
for each row execute function prevent_stock_movement_mutation();

create trigger stock_movements_no_delete
before delete on stock_movements
for each row execute function prevent_stock_movement_mutation();

-- ---------------------------------------------------------------------------
-- People & registrations
-- ---------------------------------------------------------------------------
create table people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  email text not null,
  phone text not null default '',
  city text not null default '',
  roles text[] not null default '{}',
  interests text[] not null default '{}',
  purchased_orders text[] not null default '{}',
  owned_products uuid[] not null default '{}',
  registered_products uuid[] not null default '{}',
  timeline jsonb not null default '[]'::jsonb,
  person_created_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, email)
);
create index people_org_idx on people(organization_id);
create trigger people_updated_at before update on people
for each row execute function set_updated_at();

create table product_registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  product_id uuid not null references products(id),
  batch_id uuid references manufacturing_batches(id),
  customer_id uuid references people(id),
  user_id uuid not null references people(id),
  partner_id uuid references partners(id),
  institution_id uuid references institutions(id),
  purchase_source text not null,
  registration_date date not null,
  registration_code text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, registration_code)
);
create index product_registrations_product_idx on product_registrations(product_id);
create index product_registrations_user_idx on product_registrations(user_id);
create trigger product_registrations_updated_at before update on product_registrations
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Ops / workflow screens (demo-capable)
-- ---------------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null,
  deadline date,
  budget numeric(14,2) not null default 0,
  capital_committed numeric(14,2) not null default 0,
  linked_product_ids uuid[] not null default '{}',
  vendor_ids uuid[] not null default '{}',
  tasks jsonb not null default '[]'::jsonb,
  manufacturing_orders text[] not null default '{}',
  content_task_codes text[] not null default '{}',
  risks text[] not null default '{}',
  notes text not null default '',
  world text,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create trigger projects_updated_at before update on projects
for each row execute function set_updated_at();

create table content_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  title text not null,
  product_id uuid references products(id),
  world text,
  platform text not null default '',
  format text not null default '',
  due_date date,
  status text not null,
  caption_draft text not null default '',
  assets jsonb not null default '[]'::jsonb,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create trigger content_tasks_updated_at before update on content_tasks
for each row execute function set_updated_at();

create table channel_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  customer_name text not null,
  line_items jsonb not null default '[]'::jsonb,
  payment_status text not null,
  order_date date,
  delivery_city text not null default '',
  package_weight_kg numeric(8,2) not null default 0,
  courier_status text not null,
  total numeric(12,2) not null default 0,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create trigger channel_orders_updated_at before update on channel_orders
for each row execute function set_updated_at();

create table launch_checklists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  product_id uuid references products(id),
  launch_date date,
  blockers text[] not null default '{}',
  flags jsonb not null default '{}'::jsonb,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create trigger launch_checklists_updated_at before update on launch_checklists
for each row execute function set_updated_at();

create table home_priorities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  title text not null,
  detail text not null default '',
  tone text not null default 'neutral',
  href text,
  sort_order integer not null default 0,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table home_attention_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  title text not null,
  detail text not null default '',
  href text,
  sort_order integer not null default 0,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table demo_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind)
);

create table advice_snippets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  match_key text not null,
  title text not null default '',
  body text not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table story_hamper_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
