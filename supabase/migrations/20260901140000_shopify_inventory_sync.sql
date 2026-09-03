-- Inventory sync Aarla ↔ Shopify: persist inventory item ids for set-quantities.
-- Idempotent for /setup.

alter table product_variants
  add column if not exists shopify_inventory_item_id text;

create index if not exists product_variants_shopify_inventory_item_idx
  on product_variants (organization_id, shopify_inventory_item_id)
  where shopify_inventory_item_id is not null;

-- Optional org setting for preferred Shopify location gid (push target).
create table if not exists shopify_inventory_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  primary_location_id text,
  updated_at timestamptz not null default now()
);
