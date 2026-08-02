-- Delhivery shipment tracking (normalized Shipment records)
-- Links to Shopify external_orders / external_fulfilments by AWB.
-- Does not create Customer Call queue items.

create table shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  external_order_id uuid references external_orders(id) on delete set null,
  external_fulfilment_id uuid references external_fulfilments(id) on delete set null,
  carrier text not null check (carrier in ('delhivery')),
  awb text not null,
  provider_status text,
  provider_status_type text,
  normalized_status text not null
    check (normalized_status in (
      'unknown',
      'manifested',
      'picked-up',
      'in-transit',
      'out-for-delivery',
      'delivered',
      'delivery-failed',
      'returned',
      'cancelled'
    )),
  delivered_at timestamptz,
  latest_scan_at timestamptz,
  latest_scan_location text,
  last_synced_at timestamptz not null default now(),
  sync_status text not null default 'ok'
    check (sync_status in ('ok', 'error', 'not_found', 'skipped', 'malformed')),
  sync_error text,
  raw_provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, carrier, awb)
);
create index shipments_org_idx on shipments(organization_id);
create index shipments_status_idx on shipments(organization_id, normalized_status);
create index shipments_order_idx on shipments(external_order_id);
create index shipments_fulfilment_idx on shipments(external_fulfilment_id);
create trigger shipments_updated_at before update on shipments
for each row execute function set_updated_at();

-- Append-only scan / status history
create table shipment_status_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  provider_status text,
  provider_status_type text,
  normalized_status text not null
    check (normalized_status in (
      'unknown',
      'manifested',
      'picked-up',
      'in-transit',
      'out-for-delivery',
      'delivered',
      'delivery-failed',
      'returned',
      'cancelled'
    )),
  provider_timestamp timestamptz,
  scan_location text,
  instructions text,
  event_fingerprint text not null,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  unique (shipment_id, event_fingerprint)
);
create index shipment_status_events_shipment_idx
  on shipment_status_events(shipment_id, provider_timestamp desc nulls last);
