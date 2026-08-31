-- Fulfil Orders workflow (Aarla-owned operational state).
-- Reuses external_orders + stock_movements + partner locations.
-- Idempotent for /setup.

-- ---------------------------------------------------------------------------
-- Fulfilment order header (1:1 with synced Shopify external_orders)
-- ---------------------------------------------------------------------------
create table if not exists fulfilment_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  external_order_id uuid not null references external_orders(id) on delete cascade,
  status text not null default 'received'
    check (status in (
      'received',
      'stock-check',
      'stock-exception',
      'waiting-for-partner-stock',
      'waiting-for-founder-decision',
      'waiting-for-customer',
      'ready-to-pick',
      'ready-to-pack',
      'ready-to-ship',
      'ready-for-handover',
      'ready-for-pickup',
      'dispatched',
      'cancelled',
      'refund-required'
    )),
  shipping_method text
    check (
      shipping_method is null
      or shipping_method in (
        'delhivery-surface',
        'delhivery-express',
        'store-pickup',
        'local-delivery',
        'alternate-courier'
      )
    ),
  packing_suggestion jsonb,
  packing_actual jsonb,
  packing_override_note text,
  packing_decided_at timestamptz,
  packing_decided_by text,
  freebie_product_code text,
  freebie_choice text
    check (
      freebie_choice is null
      or freebie_choice in ('add', 'change', 'none')
    ),
  freebie_note text,
  shipping_recommendation text,
  shipping_recommendation_reasons jsonb,
  shipping_decision_inputs jsonb,
  shipping_override_reason text,
  shipping_decided_at timestamptz,
  shipping_decided_by text,
  awb text,
  courier_provider text,
  courier_reference text,
  courier_cost numeric(12, 2),
  label_status text
    check (
      label_status is null
      or label_status in ('none', 'ready', 'printed')
    ),
  picked_at timestamptz,
  picked_by text,
  packed_at timestamptz,
  packed_by text,
  handed_over_at timestamptz,
  handed_over_by text,
  customer_informed_at timestamptz,
  picked_up_at timestamptz,
  local_provider text,
  local_requested_at timestamptz,
  local_booking_ref text,
  local_delivery_cost numeric(12, 2),
  local_driver_phone text,
  local_delivered_at timestamptz,
  local_notes text,
  alternate_awaiting_awb_cost boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_order_id)
);
create index if not exists fulfilment_orders_org_status_idx
  on fulfilment_orders(organization_id, status);
create index if not exists fulfilment_orders_org_updated_idx
  on fulfilment_orders(organization_id, updated_at desc);
create trigger fulfilment_orders_updated_at
  before update on fulfilment_orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Per line physical / pick state
-- ---------------------------------------------------------------------------
create table if not exists fulfilment_lines (
  id uuid primary key default gen_random_uuid(),
  fulfilment_order_id uuid not null references fulfilment_orders(id) on delete cascade,
  external_order_item_id uuid not null references external_order_items(id) on delete cascade,
  required_quantity integer not null check (required_quantity > 0),
  system_studio_qty integer,
  catalog_product_code text,
  catalog_variant_code text,
  physical_status text not null default 'unchecked'
    check (physical_status in ('unchecked', 'found', 'not-found')),
  physical_checked_at timestamptz,
  physical_checked_by text,
  picked boolean not null default false,
  picked_at timestamptz,
  resolution text
    check (
      resolution is null
      or resolution in (
        'physical-found',
        'partner-recall',
        'founder-arrange',
        'customer-wait',
        'customer-alternative',
        'refund-required',
        'cancelled'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fulfilment_order_id, external_order_item_id)
);
create index if not exists fulfilment_lines_order_idx
  on fulfilment_lines(fulfilment_order_id);
create trigger fulfilment_lines_updated_at
  before update on fulfilment_lines
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Async follow-ups (partner recall, founder, customer, courier)
-- ---------------------------------------------------------------------------
create table if not exists fulfilment_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  fulfilment_order_id uuid not null references fulfilment_orders(id) on delete cascade,
  fulfilment_line_id uuid references fulfilment_lines(id) on delete set null,
  task_type text not null
    check (task_type in (
      'partner-stock-recall',
      'founder-availability-decision',
      'customer-contact',
      'alternate-courier',
      'courier-awb-cost-followup',
      'other'
    )),
  status text not null default 'open'
    check (status in (
      'open',
      'requested',
      'in-transit',
      'received',
      'waiting',
      'completed',
      'cancelled'
    )),
  title text not null default '',
  description text not null default '',
  assignee text,
  due_at timestamptz,
  partner_code text,
  partner_location_code text,
  quantity integer,
  founder_decision text
    check (
      founder_decision is null
      or founder_decision in ('can-arrange', 'cannot-arrange', 'alternative-possible')
    ),
  expected_availability_at date,
  customer_outcome text
    check (
      customer_outcome is null
      or customer_outcome in (
        'will-wait',
        'chose-alternative',
        'refund-cancel',
        'follow-up-later'
      )
    ),
  customer_contacted_at timestamptz,
  alternative_note text,
  ledger_reference text,
  notes text,
  completed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fulfilment_tasks_org_status_idx
  on fulfilment_tasks(organization_id, status);
create index if not exists fulfilment_tasks_order_idx
  on fulfilment_tasks(fulfilment_order_id);
create trigger fulfilment_tasks_updated_at
  before update on fulfilment_tasks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Activity timeline
-- ---------------------------------------------------------------------------
create table if not exists fulfilment_events (
  id uuid primary key default gen_random_uuid(),
  fulfilment_order_id uuid not null references fulfilment_orders(id) on delete cascade,
  event_type text not null,
  summary text not null,
  detail jsonb,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists fulfilment_events_order_idx
  on fulfilment_events(fulfilment_order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Configurable freebie rules (deterministic)
-- ---------------------------------------------------------------------------
create table if not exists fulfilment_freebie_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  min_order_value numeric(12, 2) not null default 0,
  max_order_value numeric(12, 2),
  product_code text not null,
  variant_code text,
  estimated_cost numeric(12, 2),
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fulfilment_freebie_rules_org_idx
  on fulfilment_freebie_rules(organization_id, is_active, priority);
create trigger fulfilment_freebie_rules_updated_at
  before update on fulfilment_freebie_rules
  for each row execute function set_updated_at();

-- Optional shipping address fields for fulfilment / courier booking later
alter table external_orders
  add column if not exists shipping_name text;
alter table external_orders
  add column if not exists shipping_address1 text;
alter table external_orders
  add column if not exists shipping_address2 text;
alter table external_orders
  add column if not exists shipping_city text;
alter table external_orders
  add column if not exists shipping_province text;
alter table external_orders
  add column if not exists shipping_zip text;
alter table external_orders
  add column if not exists shipping_country text;
