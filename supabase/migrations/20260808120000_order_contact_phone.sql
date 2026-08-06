-- Persist best-known contact phone from Shopify order (shipping/billing/customer).
-- Lets call queues use order-level phones without a full catalog re-sync.
-- Idempotent for runtime ensure + /setup.

alter table external_orders
  add column if not exists contact_phone text;
