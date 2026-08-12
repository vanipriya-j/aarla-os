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
