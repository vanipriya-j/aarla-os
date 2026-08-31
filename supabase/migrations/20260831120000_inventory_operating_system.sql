-- Inventory Operating System — seasonality, replenishment policy, reconciliation.
-- Ledger remains SoT. Pace/aging stay derived (not stored).
-- Idempotent for /setup.

-- ---------------------------------------------------------------------------
-- Seasonal product flags (suppress false "dead" signals off-season)
-- ---------------------------------------------------------------------------
alter table products
  add column if not exists is_seasonal boolean not null default false;

alter table products
  add column if not exists season_label text;

alter table products
  add column if not exists season_active_months integer[] not null default '{}'::integer[];

-- ---------------------------------------------------------------------------
-- Manual replenishment policy (business decision — does not delete inventory)
-- ---------------------------------------------------------------------------
create table if not exists inventory_replenishment_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade,
  action text not null check (action in ('do-not-replenish')),
  reason text not null check (reason in (
    'poor_demand',
    'old_collection',
    'low_margin',
    'production_difficulty',
    'quality_issue',
    'seasonal',
    'replaced_by_new_product',
    'other'
  )),
  note text,
  effective_at timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now(),
  unique (organization_id, product_id, variant_id, action)
);

create index if not exists inventory_replenishment_policies_org_idx
  on inventory_replenishment_policies(organization_id);

-- ---------------------------------------------------------------------------
-- Physical reconciliation (count does NOT mutate ledger until resolved)
-- ---------------------------------------------------------------------------
create table if not exists inventory_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  scope text not null default 'studio'
    check (scope in ('eod', 'studio', 'category', 'product', 'variant', 'location')),
  status text not null default 'in_progress'
    check (status in ('draft', 'in_progress', 'review_required', 'completed', 'cancelled')),
  reconciliation_date date not null default (timezone('utc', now()))::date,
  started_at timestamptz not null default now(),
  started_by text,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_reconciliations_org_status_idx
  on inventory_reconciliations(organization_id, status);

create trigger inventory_reconciliations_updated_at
  before update on inventory_reconciliations
  for each row execute function set_updated_at();

create table if not exists inventory_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references inventory_reconciliations(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete set null,
  system_quantity_snapshot integer not null,
  physical_quantity integer,
  difference integer,
  reason text
    check (
      reason is null
      or reason in (
        'counting_error',
        'missing_item',
        'damage_not_recorded',
        'sale_not_recorded',
        'transfer_not_recorded',
        'receipt_not_recorded',
        'found_extra_stock',
        'other'
      )
    ),
  resolution text
    check (
      resolution is null
      or resolution in (
        'adjust_stock',
        'record_damage',
        'complete_missing_transfer',
        'complete_missing_receipt',
        'investigate',
        'defer_with_note'
      )
    ),
  adjustment_movement_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_reconciliation_items_recon_idx
  on inventory_reconciliation_items(reconciliation_id);

create trigger inventory_reconciliation_items_updated_at
  before update on inventory_reconciliation_items
  for each row execute function set_updated_at();
