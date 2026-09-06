-- Custom (non-catalog) vendor PO lines + image/design attachments.
-- Idempotent for /setup.

alter table vendor_order_items
  add column if not exists is_custom boolean not null default false;

alter table vendor_order_items
  add column if not exists description text not null default '';

create table if not exists vendor_order_item_attachments (
  id uuid primary key default gen_random_uuid(),
  vendor_order_item_id uuid not null references vendor_order_items(id) on delete cascade,
  kind text not null check (kind in ('image', 'design')),
  filename text not null,
  mime_type text not null default 'application/octet-stream',
  byte_size integer not null check (byte_size >= 0),
  content bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists vendor_order_item_attachments_item_idx
  on vendor_order_item_attachments(vendor_order_item_id);

create index if not exists vendor_order_item_attachments_kind_idx
  on vendor_order_item_attachments(vendor_order_item_id, kind);
