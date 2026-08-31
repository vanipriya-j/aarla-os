-- Manufacture / Reorder — vendor execution domain.
-- Production Requirement → Vendor Order → Workflow → Receive (ledger).
-- Idempotent for /setup.

-- ---------------------------------------------------------------------------
-- Extend vendors (manufacturing suppliers) with operational profile fields
-- ---------------------------------------------------------------------------
alter table vendors add column if not exists business_name text not null default '';
alter table vendors add column if not exists contact_person text not null default '';
alter table vendors add column if not exists phone text not null default '';
alter table vendors add column if not exists whatsapp_number text not null default '';
alter table vendors add column if not exists email text not null default '';
alter table vendors add column if not exists address text not null default '';
alter table vendors add column if not exists gstin text not null default '';
alter table vendors add column if not exists what_they_make text not null default '';
alter table vendors add column if not exists categories_supported text[] not null default '{}';
alter table vendors add column if not exists products_supported text[] not null default '{}';
alter table vendors add column if not exists payment_terms text not null default '';
alter table vendors add column if not exists advance_percentage numeric(5,2);
alter table vendors add column if not exists preferred_shipping_method text not null default '';
alter table vendors add column if not exists notes text not null default '';
alter table vendors add column if not exists is_active boolean not null default true;
alter table vendors add column if not exists how_they_work text not null default '';
alter table vendors add column if not exists workflow_template_id uuid;
alter table vendors add column if not exists stated_lead_time_days integer;
alter table vendors add column if not exists internal_buffer_days integer not null default 21;

-- ---------------------------------------------------------------------------
-- Workflow templates (approved “How this vendor works”)
-- ---------------------------------------------------------------------------
create table if not exists workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  vendor_id uuid references vendors(id) on delete set null,
  source_description text not null default '',
  vendor_lead_time_days integer,
  internal_buffer_days integer not null default 21,
  advance_percentage numeric(5,2),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists workflow_templates_org_idx on workflow_templates(organization_id);
create index if not exists workflow_templates_vendor_idx on workflow_templates(vendor_id);
drop trigger if exists workflow_templates_updated_at on workflow_templates;
create trigger workflow_templates_updated_at
  before update on workflow_templates
  for each row execute function set_updated_at();

create table if not exists workflow_template_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_template_id uuid not null references workflow_templates(id) on delete cascade,
  sequence integer not null,
  name text not null,
  step_type text not null,
  responsibility text not null default 'aarla'
    check (responsibility in ('aarla', 'vendor', 'either')),
  required boolean not null default true,
  payment_percentage numeric(5,2),
  requires_approval boolean not null default false,
  requires_attachment boolean not null default false,
  requires_vendor_confirmation boolean not null default false,
  updates_order_status text,
  notes text not null default '',
  unique (workflow_template_id, sequence)
);
create index if not exists workflow_template_steps_tpl_idx
  on workflow_template_steps(workflow_template_id, sequence);

alter table vendors
  drop constraint if exists vendors_workflow_template_id_fkey;
alter table vendors
  add constraint vendors_workflow_template_id_fkey
  foreign key (workflow_template_id) references workflow_templates(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Production requirements (Needs Making) — not yet a vendor order
-- ---------------------------------------------------------------------------
create table if not exists production_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  source_type text not null
    check (source_type in (
      'INVENTORY_REPLENISHMENT',
      'CUSTOMER_ORDER',
      'BULK_ORDER',
      'CAMPAIGN',
      'MANUAL',
      'NEW_PRODUCT',
      'PARTNER_REPLENISHMENT'
    )),
  source_id text,
  product_code text not null,
  variant_code text,
  quantity_required integer not null check (quantity_required > 0),
  quantity_already_available integer not null default 0,
  quantity_to_produce integer not null check (quantity_to_produce >= 0),
  required_by_date date,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  reason text not null default '',
  status text not null default 'open'
    check (status in ('open', 'ordered', 'deferred', 'ignored', 'fulfilled')),
  suggested_vendor_id uuid references vendors(id) on delete set null,
  transfer_suggestion jsonb,
  vendor_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists production_requirements_org_status_idx
  on production_requirements(organization_id, status);
create index if not exists production_requirements_product_idx
  on production_requirements(organization_id, product_code);
drop trigger if exists production_requirements_updated_at on production_requirements;
create trigger production_requirements_updated_at
  before update on production_requirements
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Vendor orders (SoT for external manufacturing execution)
-- ---------------------------------------------------------------------------
create table if not exists vendor_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  order_number text not null,
  vendor_id uuid not null references vendors(id),
  order_date date not null default current_date,
  status text not null default 'draft'
    check (status in (
      'draft',
      'ready_to_send',
      'sent',
      'awaiting_confirmation',
      'confirmed',
      'in_production',
      'awaiting_payment',
      'awaiting_dispatch',
      'in_transit',
      'ready_to_receive',
      'partially_received',
      'received',
      'closed',
      'cancelled'
    )),
  currency text not null default 'INR',
  pricing_status text not null default 'pending'
    check (pricing_status in ('pending', 'partial', 'confirmed')),
  subtotal numeric(12,2),
  tax numeric(12,2),
  shipping numeric(12,2),
  total numeric(12,2),
  advance_percentage numeric(5,2),
  advance_amount numeric(12,2),
  balance_amount numeric(12,2),
  requested_delivery_date date,
  vendor_committed_date date,
  internal_expected_date date,
  delivery_location text not null default 'Studio',
  notes text not null default '',
  workflow_template_id uuid references workflow_templates(id) on delete set null,
  workflow_instance_id uuid,
  created_by text not null default 'founder',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);
create index if not exists vendor_orders_org_status_idx
  on vendor_orders(organization_id, status);
create index if not exists vendor_orders_vendor_idx
  on vendor_orders(vendor_id);
drop trigger if exists vendor_orders_updated_at on vendor_orders;
create trigger vendor_orders_updated_at
  before update on vendor_orders
  for each row execute function set_updated_at();

alter table production_requirements
  drop constraint if exists production_requirements_vendor_order_id_fkey;
alter table production_requirements
  add constraint production_requirements_vendor_order_id_fkey
  foreign key (vendor_order_id) references vendor_orders(id) on delete set null;

create table if not exists vendor_order_items (
  id uuid primary key default gen_random_uuid(),
  vendor_order_id uuid not null references vendor_orders(id) on delete cascade,
  line_number integer not null,
  product_code text not null,
  variant_code text,
  title text not null default '',
  variant_label text not null default '',
  sku text not null default '',
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2),
  line_total numeric(12,2),
  material text not null default '',
  colour text not null default '',
  size_label text not null default '',
  customisation_instructions text not null default '',
  finish_instructions text not null default '',
  artwork_reference text not null default '',
  notes text not null default '',
  production_requirement_id uuid references production_requirements(id) on delete set null,
  unique (vendor_order_id, line_number)
);
create index if not exists vendor_order_items_order_idx on vendor_order_items(vendor_order_id);

-- ---------------------------------------------------------------------------
-- Workflow instances (per vendor order)
-- ---------------------------------------------------------------------------
create table if not exists workflow_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workflow_template_id uuid references workflow_templates(id) on delete set null,
  vendor_order_id uuid not null references vendor_orders(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  current_step_sequence integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_order_id)
);
drop trigger if exists workflow_instances_updated_at on workflow_instances;
create trigger workflow_instances_updated_at
  before update on workflow_instances
  for each row execute function set_updated_at();

alter table vendor_orders
  drop constraint if exists vendor_orders_workflow_instance_id_fkey;
alter table vendor_orders
  add constraint vendor_orders_workflow_instance_id_fkey
  foreign key (workflow_instance_id) references workflow_instances(id) on delete set null;

create table if not exists workflow_instance_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references workflow_instances(id) on delete cascade,
  template_step_id uuid references workflow_template_steps(id) on delete set null,
  sequence integer not null,
  name text not null,
  step_type text not null,
  responsibility text not null default 'aarla',
  status text not null default 'PENDING'
    check (status in (
      'PENDING', 'ACTIVE', 'BLOCKED', 'AWAITING_VENDOR', 'AWAITING_AARLA',
      'COMPLETED', 'SKIPPED', 'OVERDUE'
    )),
  required boolean not null default true,
  payment_percentage numeric(5,2),
  requires_approval boolean not null default false,
  requires_attachment boolean not null default false,
  started_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  assigned_to text,
  notes text not null default '',
  confirmation_data jsonb not null default '{}'::jsonb,
  unique (workflow_instance_id, sequence)
);
create index if not exists workflow_instance_steps_inst_idx
  on workflow_instance_steps(workflow_instance_id, sequence);

-- ---------------------------------------------------------------------------
-- PDF versions, communications, confirmations, payments, receipts
-- ---------------------------------------------------------------------------
create table if not exists vendor_order_pdf_versions (
  id uuid primary key default gen_random_uuid(),
  vendor_order_id uuid not null references vendor_orders(id) on delete cascade,
  version_number integer not null,
  generated_at timestamptz not null default now(),
  generated_by text not null default 'founder',
  order_snapshot jsonb not null default '{}'::jsonb,
  file_bytes bytea,
  content_type text not null default 'application/pdf',
  sent_at timestamptz,
  unique (vendor_order_id, version_number)
);

create table if not exists vendor_order_communications (
  id uuid primary key default gen_random_uuid(),
  vendor_order_id uuid not null references vendor_orders(id) on delete cascade,
  channel text not null
    check (channel in ('WHATSAPP_MANUAL', 'WHATSAPP_API', 'EMAIL', 'DOWNLOAD', 'OTHER')),
  direction text not null check (direction in ('OUTBOUND', 'INBOUND')),
  status text not null default 'SEND_INITIATED'
    check (status in ('SEND_INITIATED', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  recipient text not null default '',
  sender text not null default '',
  message text not null default '',
  pdf_version_id uuid references vendor_order_pdf_versions(id) on delete set null,
  external_message_id text,
  created_at timestamptz not null default now()
);
create index if not exists vendor_order_communications_order_idx
  on vendor_order_communications(vendor_order_id, created_at desc);

create table if not exists vendor_confirmations (
  id uuid primary key default gen_random_uuid(),
  vendor_order_id uuid not null references vendor_orders(id) on delete cascade,
  confirmed boolean not null default false,
  confirmed_quantity integer,
  confirmed_price numeric(12,2),
  committed_delivery_date date,
  vendor_notes text not null default '',
  original_requested_delivery_date date,
  original_total numeric(12,2),
  recorded_at timestamptz not null default now(),
  recorded_by text not null default 'founder'
);

create table if not exists vendor_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_order_id uuid not null references vendor_orders(id) on delete cascade,
  stage text not null
    check (stage in ('ADVANCE', 'INTERIM', 'BALANCE', 'FULL', 'OTHER')),
  amount numeric(12,2) not null,
  percentage numeric(5,2),
  due_when text not null default '',
  due_date date,
  paid_at timestamptz,
  payment_method text not null default '',
  reference text not null default '',
  status text not null default 'due'
    check (status in ('due', 'paid', 'waived', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists vendor_payments_updated_at on vendor_payments;
create trigger vendor_payments_updated_at
  before update on vendor_payments
  for each row execute function set_updated_at();

create table if not exists production_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_order_id uuid not null references vendor_orders(id) on delete cascade,
  vendor_order_item_id uuid references vendor_order_items(id) on delete set null,
  ordered_quantity integer not null,
  received_quantity integer not null default 0,
  accepted_quantity integer not null default 0,
  rejected_quantity integer not null default 0,
  damaged_quantity integer not null default 0,
  notes text not null default '',
  ledger_reference text,
  received_at timestamptz not null default now(),
  received_by text not null default 'founder'
);
create index if not exists production_receipts_order_idx on production_receipts(vendor_order_id);
