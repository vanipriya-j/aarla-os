-- =============================================================================
-- Aarla OS — COMPLETE SCHEMA (single file for clean setup)
-- =============================================================================
-- Auto-generated from supabase/migrations/*.sql (19 files).
-- Regenerate: node scripts/generate-complete-schema.js
--
-- Covers foundation + daily-ops / build-set migrations through the current branch
-- (Abandoned Carts, Inventory, Weekly Board, Shopify Reserve, GST, Campaigns,
-- and later PR 7–8 objects as those migrations land).
--
-- AFTER PR 8 IS MERGED — one clean initialization:
--   Option A: Vercel /setup with "Load demo data" UNCHECKED
--   Option B: Run this file once in Supabase SQL Editor on an empty DB
--
-- Do not load demo seed against live commerce data.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- SOURCE: 20260725140000_init_aarla_os.sql
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- SOURCE: 20260801120000_aarla_universe.sql
-- ---------------------------------------------------------------------------

-- Aarla Universe — creative knowledge graph (nodes + relationships)
-- Affinity is stored on relationships; inventory/commerce remains separate.

-- ---------------------------------------------------------------------------
-- Creative nodes
-- ---------------------------------------------------------------------------
create table creative_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  slug text not null,
  description text not null default '',
  node_types text[] not null default array['idea']::text[],
  lifecycle_status text not null default 'captured'
    check (lifecycle_status in (
      'captured','exploring','researching','developing','ready','active','paused','archived'
    )),
  maturity_status text not null default 'seed'
    check (maturity_status in ('seed','emerging','developed','established')),
  is_future boolean not null default true,
  confidence numeric(4,3) not null default 1.0,
  source text not null default 'founder'
    check (source in ('founder','seed','imported','ai-suggested','rule-based')),
  created_by text not null default 'founder',
  notes text not null default '',
  -- optional product / content opportunity fields (null for ordinary nodes)
  opportunity_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index creative_nodes_org_idx on creative_nodes(organization_id);
create index creative_nodes_title_idx on creative_nodes(organization_id, title);
create index creative_nodes_lifecycle_idx on creative_nodes(organization_id, lifecycle_status);
create index creative_nodes_future_idx on creative_nodes(organization_id, is_future);
create index creative_nodes_types_gin on creative_nodes using gin (node_types);
create trigger creative_nodes_updated_at before update on creative_nodes
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------
create table creative_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  from_node_id uuid not null references creative_nodes(id) on delete cascade,
  to_node_id uuid not null references creative_nodes(id) on delete cascade,
  relationship_type text not null,
  affinity_score numeric(5,2) not null default 0
    check (affinity_score >= 0 and affinity_score <= 100),
  relationship_status text not null default 'suggested'
    check (relationship_status in ('established','inferred','suggested','rejected')),
  explanation text not null,
  evidence jsonb not null default '[]'::jsonb,
  source text not null default 'rule-based'
    check (source in (
      'founder-confirmed','existing-data','rule-based','AI-suggested','imported','seed'
    )),
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_node_id <> to_node_id),
  unique (organization_id, from_node_id, to_node_id, relationship_type)
);

create index creative_rel_org_idx on creative_relationships(organization_id);
create index creative_rel_from_idx on creative_relationships(from_node_id);
create index creative_rel_to_idx on creative_relationships(to_node_id);
create index creative_rel_type_idx on creative_relationships(organization_id, relationship_type);
create index creative_rel_score_idx on creative_relationships(organization_id, affinity_score desc);
create index creative_rel_status_idx on creative_relationships(organization_id, relationship_status);
create trigger creative_relationships_updated_at before update on creative_relationships
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Aliases, assets, notes, events
-- ---------------------------------------------------------------------------
create table creative_node_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  node_id uuid not null references creative_nodes(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, alias)
);
create index creative_aliases_node_idx on creative_node_aliases(node_id);
create index creative_aliases_alias_idx on creative_node_aliases(organization_id, lower(alias));

create table creative_node_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  node_id uuid not null references creative_nodes(id) on delete cascade,
  kind text not null default 'image',
  url text not null default '',
  caption text not null default '',
  created_at timestamptz not null default now()
);
create index creative_assets_node_idx on creative_node_assets(node_id);

create table creative_node_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  node_id uuid not null references creative_nodes(id) on delete cascade,
  body text not null,
  created_by text not null default 'founder',
  created_at timestamptz not null default now()
);
create index creative_notes_node_idx on creative_node_notes(node_id);

create table creative_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  actor text not null default 'founder',
  source text not null default 'founder',
  previous_value jsonb,
  new_value jsonb,
  reasoning text,
  created_at timestamptz not null default now()
);
create index creative_events_org_idx on creative_events(organization_id, created_at desc);
create index creative_events_entity_idx on creative_events(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- SOURCE: 20260802120000_customer_calls.sql
-- ---------------------------------------------------------------------------

-- Customer Calls foundation (seeded queues; no Shopify/Delhivery yet)

create table customer_call_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  segment_type text not null
    check (segment_type in ('delivery-follow-up', 're-engagement')),
  script text not null,
  is_active boolean not null default true,
  cooldown_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, segment_type)
);
create index customer_call_segments_org_idx on customer_call_segments(organization_id);
create trigger customer_call_segments_updated_at before update on customer_call_segments
for each row execute function set_updated_at();

create table customer_call_queue_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  segment_id uuid not null references customer_call_segments(id) on delete cascade,
  external_customer_id text not null,
  external_order_id text,
  customer_name text not null,
  phone text not null,
  email text,
  reason text not null default '',
  last_order_date date,
  delivered_at timestamptz,
  products_summary text,
  status text not null default 'pending'
    check (status in (
      'pending','in-progress','completed','call-later','could-not-reach','skipped'
    )),
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_call_queue_org_idx on customer_call_queue_items(organization_id);
create index customer_call_queue_segment_status_idx
  on customer_call_queue_items(organization_id, segment_id, status);
create index customer_call_queue_customer_idx
  on customer_call_queue_items(organization_id, external_customer_id);
create trigger customer_call_queue_items_updated_at before update on customer_call_queue_items
for each row execute function set_updated_at();

create table customer_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  queue_item_id uuid not null references customer_call_queue_items(id) on delete cascade,
  segment_id uuid not null references customer_call_segments(id) on delete cascade,
  external_customer_id text not null,
  external_order_id text,
  purpose text not null,
  outcome text not null,
  notes text,
  follow_up_at date,
  issue_raised boolean not null default false,
  issue_type text,
  requirement_type text,
  approximate_quantity integer,
  created_by text not null default 'vyshali',
  created_at timestamptz not null default now()
);
create index customer_interactions_org_idx on customer_interactions(organization_id, created_at desc);
create index customer_interactions_customer_idx
  on customer_interactions(organization_id, external_customer_id);
create index customer_interactions_queue_idx on customer_interactions(queue_item_id);
create index customer_interactions_follow_up_idx
  on customer_interactions(organization_id, follow_up_at)
  where follow_up_at is not null;

create table customer_contact_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  external_customer_id text not null,
  do_not_contact boolean not null default false,
  reason text,
  updated_at timestamptz not null default now(),
  unique (organization_id, external_customer_id)
);
create index customer_contact_prefs_org_idx on customer_contact_preferences(organization_id);
create trigger customer_contact_preferences_updated_at before update on customer_contact_preferences
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- SOURCE: 20260803120000_external_commerce.sql
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- SOURCE: 20260804120000_shipments.sql
-- ---------------------------------------------------------------------------

-- Delhivery shipment tracking (normalized Shipment records)
-- Links to Shopify external_orders / external_fulfilments by AWB.
-- Does not create Customer Call queue items.

create table shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  external_order_id uuid references external_orders(id) on delete set null,
  external_fulfilment_id uuid references external_fulfilments(id) on delete set null,
  carrier text not null check (carrier in ('delhivery')),
  awb text not null,
  provider_status text,
  provider_status_type text,
  normalized_status text not null
    check (normalized_status in (
      'unknown',
      'manifested',
      'picked-up',
      'in-transit',
      'out-for-delivery',
      'delivered',
      'delivery-failed',
      'returned',
      'cancelled'
    )),
  delivered_at timestamptz,
  latest_scan_at timestamptz,
  latest_scan_location text,
  last_synced_at timestamptz not null default now(),
  sync_status text not null default 'ok'
    check (sync_status in ('ok', 'error', 'not_found', 'skipped', 'malformed')),
  sync_error text,
  raw_provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, carrier, awb)
);
create index shipments_org_idx on shipments(organization_id);
create index shipments_status_idx on shipments(organization_id, normalized_status);
create index shipments_order_idx on shipments(external_order_id);
create index shipments_fulfilment_idx on shipments(external_fulfilment_id);
create trigger shipments_updated_at before update on shipments
for each row execute function set_updated_at();

-- Append-only scan / status history
create table shipment_status_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  provider_status text,
  provider_status_type text,
  normalized_status text not null
    check (normalized_status in (
      'unknown',
      'manifested',
      'picked-up',
      'in-transit',
      'out-for-delivery',
      'delivered',
      'delivery-failed',
      'returned',
      'cancelled'
    )),
  provider_timestamp timestamptz,
  scan_location text,
  instructions text,
  event_fingerprint text not null,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  unique (shipment_id, event_fingerprint)
);
create index shipment_status_events_shipment_idx
  on shipment_status_events(shipment_id, provider_timestamp desc nulls last);

-- ---------------------------------------------------------------------------
-- SOURCE: 20260805120000_commerce_sync_locks.sql
-- ---------------------------------------------------------------------------

-- Global lock so Shopify and Delhivery syncs never run in parallel.
-- Client passes a holder token across chunks; stale locks expire after 15 minutes.
-- Idempotent: runtime sync may create this table before /setup records the migration.

create table if not exists commerce_sync_locks (
  id text primary key check (id = 'global'),
  holder text not null,
  channel text not null check (channel in ('shopify', 'delhivery', 'commerce')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- SOURCE: 20260806120000_commerce_sync_watermarks.sql
-- ---------------------------------------------------------------------------

-- Watermarks for incremental commerce sync (Shopify orders, etc.)
-- Idempotent: runtime sync may create this table before /setup records the migration.

create table if not exists commerce_sync_watermarks (
  channel text primary key check (channel in ('shopify_orders')),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Committed high-water: only orders after this are fetched on incremental sync
  watermark_at timestamptz,
  -- In-flight run tracking so we only commit after the final chunk
  run_id text,
  run_high_water_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists commerce_sync_watermarks_org_idx
  on commerce_sync_watermarks(organization_id);

-- ---------------------------------------------------------------------------
-- SOURCE: 20260807120000_call_queue_natural_key.sql
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- SOURCE: 20260808120000_order_contact_phone.sql
-- ---------------------------------------------------------------------------

-- Persist best-known contact phone from Shopify order (shipping/billing/customer).
-- Lets call queues use order-level phones without a full catalog re-sync.
-- Idempotent for runtime ensure + /setup.

alter table external_orders
  add column if not exists contact_phone text;

-- ---------------------------------------------------------------------------
-- SOURCE: 20260809120000_auth_sessions.sql
-- ---------------------------------------------------------------------------

-- Browser login sessions (cookie auth). Opaque token hash only — never store raw tokens.
-- Idempotent for runtime ensure + /setup.

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  username text not null,
  role text not null check (role in ('admin', 'crm')),
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists auth_sessions_active_idx
  on auth_sessions (last_seen_at desc)
  where revoked_at is null;

create index if not exists auth_sessions_expires_idx
  on auth_sessions (expires_at)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- SOURCE: 20260810120000_abandoned_checkouts.sql
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- SOURCE: 20260812120000_inventory_replenishment.sql
-- ---------------------------------------------------------------------------

-- Inventory & replenishment: variant options, reorder rules, presentation hints.
-- Ledger remains source of truth — no stored quantity columns.

-- Structured variant options for category matrices (Size, Colour, Format, …).
-- Example: {"Size":"M","Colour":"Black"} or {"Format":"8x10"}
alter table product_variants
  add column if not exists options jsonb not null default '{}'::jsonb;

-- Optional product-level presentation override: auto | matrix-apparel | matrix-art | list
alter table products
  add column if not exists inventory_presentation text not null default 'auto'
    check (inventory_presentation in ('auto', 'matrix-apparel', 'matrix-art', 'list'));

-- Configurable minimum stock (product and/or variant; optional partner scope).
create table if not exists inventory_reorder_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade,
  partner_id uuid references partners(id) on delete cascade,
  min_quantity integer not null check (min_quantity >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_reorder_rules_org_idx
  on inventory_reorder_rules(organization_id);
create index if not exists inventory_reorder_rules_product_idx
  on inventory_reorder_rules(product_id);
create unique index if not exists inventory_reorder_rules_scope_uidx
  on inventory_reorder_rules (
    organization_id,
    product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create trigger inventory_reorder_rules_updated_at
  before update on inventory_reorder_rules
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- SOURCE: 20260813120000_operating_weekly_board.sql
-- ---------------------------------------------------------------------------

-- Weekly Operating Board: typed per-org targets + manual (non-synced) metrics.
-- Week convention lives in application code (Mon 00:00 -> Sun end, Asia/Kolkata).

create table if not exists operating_targets (
  organization_id uuid primary key references organizations(id) on delete cascade,
  followers_per_week integer not null default 50,
  views_per_week integer not null default 50000,
  orders_per_day numeric(10,2) not null default 5,
  revenue_per_day numeric(12,2) not null default 3500,
  timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now()
);

create table if not exists operating_manual_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  week_start date not null, -- Monday
  kind text not null check (kind in ('followers','views')),
  value numeric(14,2) not null default 0,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (organization_id, week_start, kind)
);
create index if not exists operating_manual_metrics_org_week_idx
  on operating_manual_metrics(organization_id, week_start);

-- ---------------------------------------------------------------------------
-- SOURCE: 20260814120000_channel_reservations.sql
-- ---------------------------------------------------------------------------

-- Soft channel reservations (Shopify → Aarla OS).
-- Soft hold only: does NOT write stock_movements. Studio ledger remains SoT;
-- reserved Channel qty is still ledger Transfers, not this table.
-- Idempotent for /setup and runtime ensure.

create table if not exists channel_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  external_reference text not null,
  product_code text not null,
  variant_code text,
  sku text not null default '',
  quantity integer not null check (quantity > 0),
  status text not null default 'active'
    check (status in ('active', 'released', 'expired')),
  studio_available_at_request integer,
  contact_phone text,
  contact_name text,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_reference)
);

create index if not exists channel_reservations_org_status_idx
  on channel_reservations(organization_id, status);

create index if not exists channel_reservations_product_idx
  on channel_reservations(organization_id, product_code, (coalesce(variant_code, '')));

create trigger channel_reservations_updated_at
  before update on channel_reservations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- SOURCE: 20260815120000_gst_reconciliation.sql
-- ---------------------------------------------------------------------------

-- Monthly GST Reconciliation & Accountant Pack (PR 5)
-- Preparation workflow only — not GST filing / GSTN.
-- Idempotent for /setup after PR 8.

-- ---------------------------------------------------------------------------
-- Org accountant / GST profile
-- ---------------------------------------------------------------------------
create table if not exists organization_accountant_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  legal_name text not null default '',
  gstin text not null default '',
  state text not null default '',
  accountant_name text not null default '',
  accountant_email text not null default '',
  financial_year_start_month integer not null default 4
    check (financial_year_start_month between 1 and 12),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Extend live Shopify orders with tax / place-of-supply fields (nullable)
-- Never invent values — nulls surface as reconciliation exceptions.
-- ---------------------------------------------------------------------------
alter table external_orders
  add column if not exists taxes_included boolean;
alter table external_orders
  add column if not exists subtotal_amount numeric(12,2);
alter table external_orders
  add column if not exists total_discounts numeric(12,2);
alter table external_orders
  add column if not exists shipping_amount numeric(12,2);
alter table external_orders
  add column if not exists shipping_tax numeric(12,2);
alter table external_orders
  add column if not exists total_tax numeric(12,2);
alter table external_orders
  add column if not exists cgst numeric(12,2);
alter table external_orders
  add column if not exists sgst numeric(12,2);
alter table external_orders
  add column if not exists igst numeric(12,2);
alter table external_orders
  add column if not exists taxable_amount numeric(12,2);
alter table external_orders
  add column if not exists total_refunded numeric(12,2);
alter table external_orders
  add column if not exists shipping_province text;
alter table external_orders
  add column if not exists shipping_country text;
alter table external_orders
  add column if not exists customer_gstin text;
alter table external_orders
  add column if not exists tax_lines_json jsonb not null default '[]'::jsonb;

alter table external_order_items
  add column if not exists hsn text;
alter table external_order_items
  add column if not exists line_tax numeric(12,2);
alter table external_order_items
  add column if not exists line_discount numeric(12,2);

-- ---------------------------------------------------------------------------
-- Purchase bills (tax invoices — not manufacturing POs)
-- ---------------------------------------------------------------------------
create table if not exists purchase_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  vendor_name text not null default '',
  vendor_gstin text,
  invoice_number text not null default '',
  invoice_date date,
  taxable_value numeric(12,2) not null default 0,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  igst numeric(12,2) not null default 0,
  cess numeric(12,2),
  total_tax numeric(12,2) not null default 0,
  invoice_total numeric(12,2) not null default 0,
  source text not null default 'manual'
    check (source in ('manual', 'upload')),
  source_evidence_id uuid,
  attachment_reference text,
  notes text not null default '',
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW', 'REVIEWED', 'ISSUE', 'EXCLUDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_bills_org_date_idx
  on purchase_bills(organization_id, invoice_date desc nulls last);
create index if not exists purchase_bills_org_status_idx
  on purchase_bills(organization_id, review_status);
create trigger purchase_bills_updated_at
  before update on purchase_bills
  for each row execute function set_updated_at();

-- Uploaded PDF/image evidence (bytes stored for v1 — no Storage dependency)
create table if not exists gst_document_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  byte_size integer not null default 0,
  content bytea,
  uploaded_by text not null default '',
  extraction_hints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists gst_document_evidence_org_idx
  on gst_document_evidence(organization_id, created_at desc);

alter table purchase_bills
  drop constraint if exists purchase_bills_source_evidence_id_fkey;
alter table purchase_bills
  add constraint purchase_bills_source_evidence_id_fkey
  foreign key (source_evidence_id) references gst_document_evidence(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- Monthly reconciliation periods + immutable accountant packs
-- ---------------------------------------------------------------------------
create table if not exists gst_reconciliation_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  financial_year text not null, -- e.g. 2025-26
  month integer not null check (month between 1 and 12),
  status text not null default 'COLLECTING'
    check (status in ('COLLECTING', 'NEEDS_REVIEW', 'READY', 'SENT')),
  exception_count integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, financial_year, month)
);
create trigger gst_reconciliation_periods_updated_at
  before update on gst_reconciliation_periods
  for each row execute function set_updated_at();

create table if not exists gst_accountant_packs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_id uuid not null references gst_reconciliation_periods(id) on delete cascade,
  version integer not null,
  generated_at timestamptz not null default now(),
  generated_by text not null default '',
  exception_count integer not null default 0,
  payload_json jsonb not null default '{}'::jsonb,
  xlsx_bytes bytea,
  xlsx_filename text not null default '',
  unique (period_id, version)
);
create index if not exists gst_accountant_packs_period_idx
  on gst_accountant_packs(period_id, version desc);

create table if not exists gst_accountant_pack_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  pack_id uuid not null references gst_accountant_packs(id) on delete cascade,
  period_id uuid not null references gst_reconciliation_periods(id) on delete cascade,
  recipient text not null,
  sent_at timestamptz not null default now(),
  sent_by text not null default '',
  exception_count integer not null default 0,
  channel text not null default 'download_mark_sent'
    check (channel in ('download_mark_sent', 'email'))
);
create index if not exists gst_accountant_pack_sends_period_idx
  on gst_accountant_pack_sends(period_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- SOURCE: 20260816120000_campaign_planner.sql
-- ---------------------------------------------------------------------------

-- Campaign & Inventory Planner (ops campaigns — not Universe creative nodes).
-- Soft allocations only: does NOT write stock_movements.
-- Idempotent for /setup after PR 8.

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  daily_ad_budget numeric(12,2) not null default 0,
  planned_ad_spend numeric(12,2) not null default 0,
  target_revenue numeric(12,2),
  target_orders integer,
  target_aov numeric(12,2),
  status text not null default 'DRAFT'
    check (status in (
      'DRAFT',
      'INVENTORY_PLANNING',
      'READY',
      'LIVE',
      'PAUSED',
      'COMPLETED'
    )),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists campaigns_org_status_idx
  on campaigns(organization_id, status);
create index if not exists campaigns_org_dates_idx
  on campaigns(organization_id, start_date, end_date);

drop trigger if exists campaigns_updated_at on campaigns;
create trigger campaigns_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Line items (planned mix — cost/price snapshots)
-- ---------------------------------------------------------------------------
create table if not exists campaign_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  product_code text not null,
  variant_code text,
  planned_quantity integer not null default 0 check (planned_quantity >= 0),
  unit_cost numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaign_line_items_campaign_idx
  on campaign_line_items(campaign_id);
create unique index if not exists campaign_line_items_unique_idx
  on campaign_line_items (campaign_id, product_code, (coalesce(variant_code, '')));

drop trigger if exists campaign_line_items_updated_at on campaign_line_items;
create trigger campaign_line_items_updated_at
  before update on campaign_line_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Soft allocations (share Studio pool with channel_reservations — no ledger writes)
-- ---------------------------------------------------------------------------
create table if not exists campaign_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  product_code text not null,
  variant_code text,
  quantity integer not null check (quantity > 0),
  status text not null default 'active'
    check (status in ('active', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaign_allocations_campaign_idx
  on campaign_allocations(campaign_id, status);
create index if not exists campaign_allocations_product_idx
  on campaign_allocations(organization_id, product_code, (coalesce(variant_code, '')));
-- One active soft hold per campaign × product × variant
create unique index if not exists campaign_allocations_active_unique_idx
  on campaign_allocations (campaign_id, product_code, (coalesce(variant_code, '')))
  where status = 'active';

drop trigger if exists campaign_allocations_updated_at on campaign_allocations;
create trigger campaign_allocations_updated_at
  before update on campaign_allocations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- SOURCE: 20260817120000_campaign_partner_recall.sql
-- ---------------------------------------------------------------------------

-- Campaign Partner Inventory Recall (planning only — Potentially Recoverable).
-- Does NOT write stock_movements / change location balances.
-- READY gate remains Current readiness (Studio soft-allocated) only.
-- Idempotent for /setup after PR 8.

-- ---------------------------------------------------------------------------
-- Partner recall planning rows (one per campaign × partner × product × variant)
-- ---------------------------------------------------------------------------
create table if not exists campaign_partner_recalls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  partner_code text not null,
  product_code text not null,
  variant_code text,
  quantity integer not null check (quantity >= 0),
  status text not null
    check (status in ('AVAILABLE_TO_RECALL', 'DO_NOT_RECALL', 'RECALL_REQUESTED')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists campaign_partner_recalls_scope_uidx
  on campaign_partner_recalls (
    campaign_id, partner_code, product_code,
    coalesce(variant_code, '')
  );

create index if not exists campaign_partner_recalls_campaign_idx
  on campaign_partner_recalls(campaign_id);

create index if not exists campaign_partner_recalls_org_product_idx
  on campaign_partner_recalls(organization_id, product_code, (coalesce(variant_code, '')));

drop trigger if exists campaign_partner_recalls_updated_at on campaign_partner_recalls;
create trigger campaign_partner_recalls_updated_at
  before update on campaign_partner_recalls
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- SOURCE: 20260818120000_commerce_cart_funnel.sql
-- ---------------------------------------------------------------------------

-- Enhanced Cart Tracking + Live Campaign Commerce Funnel (PR 8)
-- Pixel/cart sessions are demand signal only — NEVER write stock_movements
-- or soft channel_reservations from this path.
-- Idempotent for /setup after PR 8.

-- ---------------------------------------------------------------------------
-- commerce_events (immutable-ish event log; fingerprint uniqueness)
-- ---------------------------------------------------------------------------
create table if not exists commerce_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  event_fingerprint text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  anonymous_session_id text,
  shopify_client_id text,
  cart_token text,
  checkout_token text,
  order_external_id text,
  customer_external_id text,
  email text,
  phone text,
  customer_name text,
  product_external_id text,
  variant_external_id text,
  sku text,
  product_title text,
  quantity integer,
  unit_price numeric(12, 2),
  currency text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  campaign_id uuid references campaigns(id) on delete set null,
  consent_state text,
  privacy_state text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, provider, event_fingerprint)
);

create index if not exists commerce_events_occurred_idx
  on commerce_events(organization_id, occurred_at desc);
create index if not exists commerce_events_anon_idx
  on commerce_events(organization_id, anonymous_session_id)
  where anonymous_session_id is not null;
create index if not exists commerce_events_cart_token_idx
  on commerce_events(organization_id, cart_token)
  where cart_token is not null;
create index if not exists commerce_events_checkout_token_idx
  on commerce_events(organization_id, checkout_token)
  where checkout_token is not null;
create index if not exists commerce_events_campaign_idx
  on commerce_events(organization_id, campaign_id, occurred_at desc)
  where campaign_id is not null;
create index if not exists commerce_events_type_idx
  on commerce_events(organization_id, event_type, occurred_at desc);

-- ---------------------------------------------------------------------------
-- cart_sessions (materialized session for ops / Customer Calls)
-- ---------------------------------------------------------------------------
create table if not exists cart_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  anonymous_session_id text,
  cart_token text,
  checkout_token text,
  checkout_external_id text,
  order_external_id text,
  customer_external_id text,
  customer_name text,
  email text,
  phone text,
  status text not null default 'ACTIVE'
    check (status in (
      'ACTIVE',
      'CART_ABANDONED',
      'CHECKOUT_ABANDONED',
      'IDENTIFIED',
      'OUTREACH_PENDING',
      'OUTREACH_COMPLETED',
      'RECOVERED',
      'CONVERTED',
      'EXPIRED'
    )),
  cart_value numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  campaign_id uuid references campaigns(id) on delete set null,
  recovery_url text,
  outreach_state text,
  assigned_to text,
  notes text,
  first_activity_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  abandoned_at timestamptz,
  recovered_at timestamptz,
  converted_at timestamptz,
  recovered_order_external_id text,
  recovered_revenue numeric(12, 2),
  identity_provenance text,
  consent_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cart_sessions_org_status_idx
  on cart_sessions(organization_id, status, last_activity_at desc);
create index if not exists cart_sessions_anon_idx
  on cart_sessions(organization_id, anonymous_session_id)
  where anonymous_session_id is not null;
create index if not exists cart_sessions_campaign_idx
  on cart_sessions(organization_id, campaign_id)
  where campaign_id is not null;
create index if not exists cart_sessions_phone_idx
  on cart_sessions(organization_id, phone)
  where phone is not null;

create unique index if not exists cart_sessions_cart_token_uidx
  on cart_sessions(organization_id, provider, cart_token)
  where cart_token is not null;
create unique index if not exists cart_sessions_checkout_token_uidx
  on cart_sessions(organization_id, provider, checkout_token)
  where checkout_token is not null;

drop trigger if exists cart_sessions_updated_at on cart_sessions;
create trigger cart_sessions_updated_at
  before update on cart_sessions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- cart_session_items
-- ---------------------------------------------------------------------------
create table if not exists cart_session_items (
  id uuid primary key default gen_random_uuid(),
  cart_session_id uuid not null references cart_sessions(id) on delete cascade,
  product_external_id text,
  variant_external_id text,
  sku text,
  title text not null default '',
  variant_title text,
  quantity integer not null default 0 check (quantity >= 0),
  unit_price numeric(12, 2) not null default 0,
  line_value numeric(12, 2) not null default 0,
  image_url text
);

create index if not exists cart_session_items_session_idx
  on cart_session_items(cart_session_id);

create unique index if not exists cart_session_items_line_uidx
  on cart_session_items (
    cart_session_id,
    coalesce(variant_external_id, ''),
    coalesce(sku, ''),
    title
  );

-- ---------------------------------------------------------------------------
-- campaign_utm_mappings (thin UTM → campaign link)
-- ---------------------------------------------------------------------------
create table if not exists campaign_utm_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  utm_campaign text not null,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, utm_campaign)
);

create index if not exists campaign_utm_mappings_campaign_idx
  on campaign_utm_mappings(campaign_id);

-- ---------------------------------------------------------------------------
-- SOURCE: 20260819120000_shipment_promised_delivery.sql
-- ---------------------------------------------------------------------------

-- Promised / expected delivery from Delhivery tracking (PromisedDeliveryDate / ExpectedDeliveryDate).
-- Idempotent for /setup and runtime ensure.

alter table shipments
  add column if not exists promised_delivery_at timestamptz;

create index if not exists shipments_promised_delivery_idx
  on shipments(organization_id, promised_delivery_at desc nulls last);

-- Best-effort backfill from already-synced verbose payloads (Shipment object or wrapped).
do $$
declare
  r record;
  raw text;
  ts timestamptz;
begin
  for r in
    select id, raw_provider_payload
    from shipments
    where promised_delivery_at is null
      and raw_provider_payload is not null
  loop
    raw := nullif(
      coalesce(
        r.raw_provider_payload->>'PromisedDeliveryDate',
        r.raw_provider_payload->'Shipment'->>'PromisedDeliveryDate',
        r.raw_provider_payload->>'ExpectedDeliveryDate',
        r.raw_provider_payload->'Shipment'->>'ExpectedDeliveryDate'
      ),
      ''
    );
    if raw is null then
      continue;
    end if;
    begin
      ts := raw::timestamptz;
      update shipments set promised_delivery_at = ts where id = r.id;
    exception when others then
      null;
    end;
  end loop;
end $$;

