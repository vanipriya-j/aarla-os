import type { PoolClient, QueryResult } from "pg";
import { ORG_ID, stableId } from "./ids";
import { DELIVERY_SCRIPT, REENGAGEMENT_SCRIPT } from "@/lib/domain/customer-calls-types";

type DbClient = Pick<PoolClient, "query">;

const DELIVERY_SEG = stableId("call-seg:delivery-follow-up");
const REENG_SEG = stableId("call-seg:re-engagement");

type SeedQueue = {
  slug: string;
  segment: "delivery" | "reeng";
  customerId: string;
  orderId?: string;
  name: string;
  phone: string;
  email?: string;
  reason: string;
  lastOrderDate?: string;
  deliveredAt?: string;
  products: string;
};

/** Offline demo rows — only inserted when no Shopify/Delhivery commerce exists. */
export const DEMO_CALL_QUEUE: SeedQueue[] = [
  {
    slug: "del-1",
    segment: "delivery",
    customerId: "cust-meera-iyer",
    orderId: "ORD-10421",
    name: "Meera Iyer",
    phone: "+91 98400 11101",
    email: "meera.demo@aarla.test",
    reason: "Order delivered 2 days ago — check experience",
    lastOrderDate: "2026-07-28",
    deliveredAt: "2026-07-30T10:00:00Z",
    products: "Lakshmi Brass Davara Tumbler ×1, Ganapathi Magnet Set ×1",
  },
  {
    slug: "del-2",
    segment: "delivery",
    customerId: "cust-arjun-rao",
    orderId: "ORD-10422",
    name: "Arjun Rao",
    phone: "+91 98400 11102",
    email: "arjun.demo@aarla.test",
    reason: "Order delivered yesterday",
    lastOrderDate: "2026-07-29",
    deliveredAt: "2026-07-31T14:30:00Z",
    products: "Muruga Water Bottle — 750ml ×2",
  },
  {
    slug: "reeng-1",
    segment: "reeng",
    customerId: "cust-deepa-r",
    name: "Deepa R",
    phone: "+91 98400 22201",
    reason: "No purchase in 90+ days",
    lastOrderDate: "2026-04-15",
    products: "Previously: Muruga world items",
  },
  {
    slug: "reeng-2",
    segment: "reeng",
    customerId: "cust-suresh-k",
    name: "Suresh K",
    phone: "+91 98400 22202",
    reason: "No purchase in 90+ days",
    lastOrderDate: "2026-03-22",
    products: "Previously: festival magnets",
  },
];

async function count(client: DbClient, sql: string, params: unknown[]): Promise<number> {
  const res = (await client.query(sql, params)) as QueryResult<{ c: string }>;
  return Number(res.rows[0]?.c ?? 0);
}

async function ensureSourceKey(client: DbClient): Promise<void> {
  await client.query(`
    alter table customer_call_queue_items add column if not exists source_key text
  `);
  await client.query(`
    update customer_call_queue_items
    set source_key = 'legacy:' || id::text
    where source_key is null
  `);
  await client.query(`
    do $$ begin
      alter table customer_call_queue_items alter column source_key set not null;
    exception when others then null;
    end $$
  `);
  await client.query(`
    create unique index if not exists customer_call_queue_source_key_uidx
      on customer_call_queue_items (organization_id, segment_id, source_key)
  `);
}

async function insertDemoQueue(client: DbClient, rows: SeedQueue[]): Promise<void> {
  for (const row of rows) {
    const segmentId = row.segment === "delivery" ? DELIVERY_SEG : REENG_SEG;
    const id = stableId(`call-q:${row.slug}`);
    const sourceKey =
      row.segment === "delivery"
        ? `seed:delivery:${row.customerId}:${row.orderId ?? row.slug}`
        : `seed:reeng:${row.customerId}`;
    await client.query(
      `insert into customer_call_queue_items (
        id, organization_id, segment_id, source_key, external_customer_id, external_order_id,
        customer_name, phone, email, reason, last_order_date, delivered_at,
        products_summary, status, assigned_to
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',null)
      on conflict (id) do nothing`,
      [
        id,
        ORG_ID,
        segmentId,
        sourceKey,
        row.customerId,
        row.orderId ?? null,
        row.name,
        row.phone,
        row.email ?? null,
        row.reason,
        row.lastOrderDate ?? null,
        row.deliveredAt ?? null,
        row.products,
      ],
    );
  }
}

async function clearSeedPending(client: DbClient): Promise<void> {
  await client.query(
    `delete from customer_call_queue_items
     where organization_id = $1
       and status = 'pending'
       and (
         source_key like 'seed:%'
         or source_key like 'legacy:%'
         or external_customer_id like 'cust-%'
       )
       and not exists (
         select 1 from customer_interactions i
         where i.queue_item_id = customer_call_queue_items.id
       )`,
    [ORG_ID],
  );
}

/**
 * Seed call segments always. Demo queue rows only when no commerce has been synced,
 * so production /setup after Shopify sync does not resurrect Meera Iyer.
 */
export async function seedCustomerCalls(client: DbClient): Promise<void> {
  console.log("[seed-db] customer_call_segments…");
  await client.query(
    `insert into customer_call_segments (
      id, organization_id, name, description, segment_type, script, is_active, cooldown_days
    ) values
      ($1,$2,'Delivery Follow-up','Check post-delivery experience','delivery-follow-up',$3,true,14),
      ($4,$2,'Re-engagement — No Purchase in 90 Days','Warm outreach for lapsed buyers','re-engagement',$5,true,90)
    on conflict (organization_id, segment_type) do nothing`,
    [DELIVERY_SEG, ORG_ID, DELIVERY_SCRIPT, REENG_SEG, REENGAGEMENT_SCRIPT],
  );

  await ensureSourceKey(client);

  const customers = await count(
    client,
    `select count(*)::text as c from external_customers where organization_id = $1`,
    [ORG_ID],
  );
  const shipments = await count(
    client,
    `select count(*)::text as c from shipments where organization_id = $1`,
    [ORG_ID],
  );

  if (customers > 0 || shipments > 0) {
    console.log(
      "[seed-db] skip demo call queues — commerce data present; clearing seed pending…",
    );
    await clearSeedPending(client);
    return;
  }

  console.log(`[seed-db] customer_call_queue_items demo (${DEMO_CALL_QUEUE.length})…`);
  await insertDemoQueue(client, DEMO_CALL_QUEUE);
}

/** Test helper: force-insert a small demo queue regardless of commerce. */
export async function seedDemoCallQueuesForTests(client: DbClient): Promise<void> {
  await client.query(
    `insert into customer_call_segments (
      id, organization_id, name, description, segment_type, script, is_active, cooldown_days
    ) values
      ($1,$2,'Delivery Follow-up','Check post-delivery experience','delivery-follow-up',$3,true,14),
      ($4,$2,'Re-engagement — No Purchase in 90 Days','Warm outreach for lapsed buyers','re-engagement',$5,true,90)
    on conflict (organization_id, segment_type) do nothing`,
    [DELIVERY_SEG, ORG_ID, DELIVERY_SCRIPT, REENG_SEG, REENGAGEMENT_SCRIPT],
  );
  await ensureSourceKey(client);
  await insertDemoQueue(client, DEMO_CALL_QUEUE);
}
