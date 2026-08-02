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
