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
