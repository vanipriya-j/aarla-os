import type { PoolClient } from "pg";
import { ORG_ID, stableId } from "./ids";

type DbClient = Pick<PoolClient, "query">;

/**
 * Minimal Shopify external commerce rows so Delhivery sync / e2e can track AWBs
 * without calling the live Shopify Admin API.
 */
export async function seedDelhiveryDemoCommerce(client: DbClient): Promise<void> {
  const customerId = stableId("ext-cust:delhivery-demo");
  const order1 = stableId("ext-order:delhivery-demo-1");
  const order2 = stableId("ext-order:delhivery-demo-2");
  const ful1 = stableId("ext-ful:delhivery-demo-1");
  const ful2 = stableId("ext-ful:delhivery-demo-2");
  const fulBlue = stableId("ext-ful:bluedart-demo");

  await client.query(
    `insert into external_customers (
       id, organization_id, provider, external_id, name, phone, email, last_synced_at
     ) values ($1,$2,'shopify','cust-delhivery-demo','Delhivery Demo Customer',
               '+91 90000 00099','delhivery.demo@aarla.test', now())
     on conflict (organization_id, provider, external_id) do update set
       name = excluded.name, last_synced_at = now()`,
    [customerId, ORG_ID],
  );

  await client.query(
    `insert into external_orders (
       id, organization_id, provider, external_id, order_number, external_customer_id,
       order_date, financial_status, fulfilment_status, is_valid, total_amount, currency, last_synced_at
     ) values
       ($1,$3,'shopify','ord-delhivery-1','#DEL-1001',$4,'2026-07-20T10:00:00Z','PAID','FULFILLED',true,1890,'INR',now()),
       ($2,$3,'shopify','ord-delhivery-2','#DEL-1002',$4,'2026-07-28T14:30:00Z','PAID','FULFILLED',true,2490,'INR',now())
     on conflict (organization_id, provider, external_id) do update set
       order_number = excluded.order_number, last_synced_at = now()`,
    [order1, order2, ORG_ID, customerId],
  );

  await client.query(
    `insert into external_fulfilments (
       id, organization_id, provider, external_id, external_order_id,
       tracking_company, tracking_number, tracking_url, fulfilment_status, last_synced_at
     ) values
       ($1,$4,'shopify','ful-delhivery-1',$5,'Delhivery','AWB1001DEL',
        'https://www.delhivery.com/track/package/AWB1001DEL','SUCCESS',now()),
       ($2,$4,'shopify','ful-delhivery-2',$6,'Delhivery','AWB1002DEL',
        'https://www.delhivery.com/track/package/AWB1002DEL','SUCCESS',now()),
       ($3,$4,'shopify','ful-bluedart-1',$6,'BlueDart',null,null,'PENDING',now())
     on conflict (organization_id, provider, external_id) do update set
       tracking_company = excluded.tracking_company,
       tracking_number = excluded.tracking_number,
       tracking_url = excluded.tracking_url,
       last_synced_at = now()`,
    [ful1, ful2, fulBlue, ORG_ID, order1, order2],
  );
}
