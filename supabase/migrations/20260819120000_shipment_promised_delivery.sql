-- Promised / expected delivery from Delhivery tracking (PromisedDeliveryDate / ExpectedDeliveryDate).
-- Idempotent for /setup and runtime ensure.

alter table shipments
  add column if not exists promised_delivery_at timestamptz;

create index if not exists shipments_promised_delivery_idx
  on shipments(organization_id, promised_delivery_at desc nulls last);

-- Best-effort backfill from already-synced verbose payloads (Shipment object or wrapped).
do $$
declare
  r record;
  raw text;
  ts timestamptz;
begin
  for r in
    select id, raw_provider_payload
    from shipments
    where promised_delivery_at is null
      and raw_provider_payload is not null
  loop
    raw := nullif(
      coalesce(
        r.raw_provider_payload->>'PromisedDeliveryDate',
        r.raw_provider_payload->'Shipment'->>'PromisedDeliveryDate',
        r.raw_provider_payload->>'ExpectedDeliveryDate',
        r.raw_provider_payload->'Shipment'->>'ExpectedDeliveryDate'
      ),
      ''
    );
    if raw is null then
      continue;
    end if;
    begin
      ts := raw::timestamptz;
      update shipments set promised_delivery_at = ts where id = r.id;
    exception when others then
      null;
    end;
  end loop;
end $$;
