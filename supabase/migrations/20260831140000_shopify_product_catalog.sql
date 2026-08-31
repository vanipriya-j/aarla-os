-- Shopify product catalog sync → Aarla products / product_variants.
-- Catalog metadata only — does NOT write stock_movements.
-- Idempotent for /setup.

alter table products
  add column if not exists shopify_product_id text;

alter table products
  add column if not exists catalog_source text not null default 'manual';

alter table product_variants
  add column if not exists shopify_variant_id text;

create unique index if not exists products_org_shopify_product_id_uidx
  on products (organization_id, shopify_product_id)
  where shopify_product_id is not null;

create unique index if not exists product_variants_org_shopify_variant_id_uidx
  on product_variants (organization_id, shopify_variant_id)
  where shopify_variant_id is not null;

-- Widen commerce sync watermark channels for catalog sync.
alter table commerce_sync_watermarks drop constraint if exists commerce_sync_watermarks_channel_check;

alter table commerce_sync_watermarks
  add constraint commerce_sync_watermarks_channel_check
  check (channel in (
    'shopify_orders',
    'shopify_abandoned_checkouts',
    'delhivery_awbs',
    'shopify_products'
  ));
