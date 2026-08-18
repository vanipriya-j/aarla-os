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
