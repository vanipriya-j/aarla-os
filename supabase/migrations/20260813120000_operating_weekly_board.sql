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
