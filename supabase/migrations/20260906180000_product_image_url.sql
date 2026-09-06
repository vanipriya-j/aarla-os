-- Persist Shopify featured image URL on catalog products for PO PDF thumbnails.
-- Idempotent for /setup.

alter table products
  add column if not exists image_url text;

create index if not exists products_image_url_idx
  on products(organization_id)
  where image_url is not null;
