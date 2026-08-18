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
