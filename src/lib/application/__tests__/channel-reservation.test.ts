import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query } from "@/lib/infra/db/pool";
import { ORG_ID } from "@/lib/infra/db/ids";
import { createShopifyReservation } from "@/lib/application/channel-reservation-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const runId = `${Date.now()}`;

describe.runIf(hasDb)("Shopify soft reservation service", () => {
  let productCode: string;
  let productSku: string;
  let studioUuid: string;
  let externalUuid: string;
  let productUuid: string;

  beforeAll(async () => {
    // Ensure table exists (migration may not have been applied in this env).
    await query(`
      create table if not exists channel_reservations (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        provider text not null check (provider in ('shopify')),
        external_reference text not null,
        product_code text not null,
        variant_code text,
        sku text not null default '',
        quantity integer not null check (quantity > 0),
        status text not null default 'active'
          check (status in ('active', 'released', 'expired')),
        studio_available_at_request integer,
        contact_phone text,
        contact_name text,
        notes text not null default '',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (organization_id, provider, external_reference)
      )
    `);

    const products = await query<{ id: string; code: string; sku: string }>(
      `select id, code, sku from products where organization_id = $1 order by code limit 1`,
      [ORG_ID],
    );
    const studio = await query<{ id: string }>(
      `select id from locations where organization_id = $1 and code = 'loc-studio'`,
      [ORG_ID],
    );
    const external = await query<{ id: string }>(
      `select id from locations where organization_id = $1 and code = 'loc-external'`,
      [ORG_ID],
    );
    if (!products[0] || !studio[0] || !external[0]) {
      throw new Error("Seed data missing — run db:migrate && db:seed");
    }
    productUuid = products[0].id;
    productCode = products[0].code;
    productSku = products[0].sku;
    studioUuid = studio[0].id;
    externalUuid = external[0].id;

    // Guarantee Studio stock for this product (product-level movement, no variant).
    await query(
      `insert into stock_movements (
         id, organization_id, code, movement_date, product_id, variant_id, quantity,
         from_location_id, to_location_id, movement_type, reference, notes
       ) values (
         gen_random_uuid(), $1, $2, current_date, $3, null, 25,
         $4, $5, 'Purchase Receipt', $6, 'test soft reserve stock'
       )`,
      [
        ORG_ID,
        `TEST-RSV-MV-${runId}`,
        productUuid,
        externalUuid,
        studioUuid,
        `test-rsv-${runId}`,
      ],
    );
  });

  afterAll(async () => {
    await query(
      `delete from channel_reservations where organization_id = $1 and external_reference like $2`,
      [ORG_ID, `test-rsv-${runId}%`],
    );
    await closePool();
  });

  it("creates a soft reservation without requiring a Transfer", async () => {
    const ref = `test-rsv-${runId}-a`;
    const result = await createShopifyReservation({
      externalReference: ref,
      sku: productSku,
      quantity: 2,
      contactName: "Test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.continueWhatsApp).toBe(true);
    expect(result.reservation.idempotentReplay).toBe(false);
    expect(result.reservation.productId).toBe(productCode);
    expect(result.reservation.quantity).toBe(2);
    expect(result.reservation.status).toBe("active");

    const movementCount = await query<{ c: string | number }>(
      `select count(*)::int as c from stock_movements
       where organization_id = $1 and reference = $2`,
      [ORG_ID, ref],
    );
    expect(Number(movementCount[0]?.c ?? 0)).toBe(0);
  });

  it("replays the same externalReference idempotently", async () => {
    const ref = `test-rsv-${runId}-a`;
    const again = await createShopifyReservation({
      externalReference: ref,
      sku: productSku,
      quantity: 99,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.reservation.idempotentReplay).toBe(true);
    expect(again.reservation.quantity).toBe(2);
  });

  it("rejects when soft-available Studio stock is insufficient", async () => {
    const result = await createShopifyReservation({
      externalReference: `test-rsv-${runId}-huge`,
      sku: productSku,
      quantity: 1_000_000,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("insufficient_stock");
    expect(result.continueWhatsApp).toBe(true);
  });

  it("rejects unknown SKU", async () => {
    const result = await createShopifyReservation({
      externalReference: `test-rsv-${runId}-missing`,
      sku: `NO-SUCH-SKU-${runId}`,
      quantity: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("product_not_found");
    expect(result.continueWhatsApp).toBe(true);
  });
});
