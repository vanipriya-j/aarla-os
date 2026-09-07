-- Partner invoices (collated sales) + payments with screenshot attachments.
-- Idempotent for /setup.

create table if not exists partner_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  code text not null,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'partially_paid', 'paid', 'void')),
  currency text not null default 'INR',
  computed_total numeric(12, 2) not null default 0,
  adjusted_total numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  notes text not null default '',
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists partner_invoices_partner_idx
  on partner_invoices(organization_id, partner_id, created_at desc);

drop trigger if exists partner_invoices_updated_at on partner_invoices;
create trigger partner_invoices_updated_at
before update on partner_invoices
for each row execute function set_updated_at();

create table if not exists partner_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references partner_invoices(id) on delete cascade,
  movement_id uuid references stock_movements(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  variant_id uuid references product_variants(id) on delete set null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists partner_invoice_lines_invoice_idx
  on partner_invoice_lines(invoice_id);

create unique index if not exists partner_invoice_lines_movement_unique
  on partner_invoice_lines(movement_id)
  where movement_id is not null;

create table if not exists partner_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  invoice_id uuid not null references partner_invoices(id) on delete cascade,
  code text not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists partner_payments_invoice_idx
  on partner_payments(invoice_id, paid_at desc);

create table if not exists partner_payment_attachments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references partner_payments(id) on delete cascade,
  filename text not null,
  mime_type text not null default 'image/jpeg',
  byte_size integer not null check (byte_size >= 0),
  content bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists partner_payment_attachments_payment_idx
  on partner_payment_attachments(payment_id);
