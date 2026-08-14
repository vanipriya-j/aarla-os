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
