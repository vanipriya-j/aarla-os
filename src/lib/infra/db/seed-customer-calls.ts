import type { PoolClient } from "pg";
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

const QUEUE: SeedQueue[] = [
  // Delivery follow-up
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
    slug: "del-3",
    segment: "delivery",
    customerId: "cust-nisha-krishnan",
    orderId: "ORD-10418",
    name: "Nisha Krishnan",
    phone: "+91 98400 11103",
    reason: "Festival hamper delivered — confirm intact",
    lastOrderDate: "2026-07-25",
    deliveredAt: "2026-07-29T09:15:00Z",
    products: "Navarathri Magnet Assortment, Story card pack",
  },
  {
    slug: "del-4",
    segment: "delivery",
    customerId: "cust-vikram-s",
    orderId: "ORD-10425",
    name: "Vikram S",
    phone: "+91 98400 11104",
    email: "vikram.demo@aarla.test",
    reason: "First-time buyer follow-up",
    lastOrderDate: "2026-07-30",
    deliveredAt: "2026-08-01T11:00:00Z",
    products: "Chennai Market Tote ×1",
  },
  {
    slug: "del-5",
    segment: "delivery",
    customerId: "cust-priya-menon",
    orderId: "ORD-10419",
    name: "Priya Menon",
    phone: "+91 98400 11105",
    reason: "Gift order delivered to recipient",
    lastOrderDate: "2026-07-26",
    deliveredAt: "2026-07-30T16:45:00Z",
    products: "Bharatanatyam Gesture Pouch ×1, Amman Stories book ×1",
  },
  {
    slug: "del-6",
    segment: "delivery",
    customerId: "cust-karthik-n",
    orderId: "ORD-10427",
    name: "Karthik N",
    phone: "+91 98400 11106",
    reason: "Bulk family order delivered",
    lastOrderDate: "2026-07-31",
    deliveredAt: "2026-08-01T08:20:00Z",
    products: "Ganapathi Fridge Magnet Set ×4",
  },
  {
    slug: "del-7",
    segment: "delivery",
    customerId: "cust-ananya-p",
    orderId: "ORD-10415",
    name: "Ananya P",
    phone: "+91 98400 11107",
    email: "ananya.demo@aarla.test",
    reason: "Delayed delivery — confirm arrival quality",
    lastOrderDate: "2026-07-20",
    deliveredAt: "2026-07-28T12:00:00Z",
    products: "Lakshmi Brass Davara Tumbler ×1",
  },
  {
    slug: "del-8",
    segment: "delivery",
    customerId: "cust-rahul-desai",
    orderId: "ORD-10428",
    name: "Rahul Desai",
    phone: "+91 98400 11108",
    reason: "Corporate sample pack delivered",
    lastOrderDate: "2026-07-31",
    deliveredAt: "2026-08-01T15:10:00Z",
    products: "Assorted magnets ×10, thank-you cards ×10",
  },
  // Re-engagement
  {
    slug: "re-1",
    segment: "reeng",
    customerId: "cust-lakshmi-r",
    orderId: "ORD-9801",
    name: "Lakshmi R",
    phone: "+91 98400 22201",
    email: "lakshmi.demo@aarla.test",
    reason: "No purchase in 90+ days — Varalakshmi / Navarathri",
    lastOrderDate: "2026-04-15",
    products: "Previously: Lakshmi tumbler",
  },
  {
    slug: "re-2",
    segment: "reeng",
    customerId: "cust-suresh-k",
    orderId: "ORD-9720",
    name: "Suresh K",
    phone: "+91 98400 22202",
    reason: "No purchase in 90+ days — corporate gifting angle",
    lastOrderDate: "2026-03-22",
    products: "Previously: Muruga bottles ×6",
  },
  {
    slug: "re-3",
    segment: "reeng",
    customerId: "cust-divya-m",
    name: "Divya M",
    phone: "+91 98400 22203",
    email: "divya.demo@aarla.test",
    reason: "No purchase in 90+ days — festival season",
    lastOrderDate: "2026-04-01",
    products: "Previously: Navarathri magnets",
  },
  {
    slug: "re-4",
    segment: "reeng",
    customerId: "cust-harini-v",
    orderId: "ORD-9655",
    name: "Harini V",
    phone: "+91 98400 22204",
    reason: "No purchase in 90+ days — personal gifting",
    lastOrderDate: "2026-03-10",
    products: "Previously: Bharatanatyam pouch",
  },
  {
    slug: "re-5",
    segment: "reeng",
    customerId: "cust-mohan-t",
    name: "Mohan T",
    phone: "+91 98400 22205",
    reason: "No purchase in 90+ days",
    lastOrderDate: "2026-04-20",
    products: "Previously: Chennai tote",
  },
  {
    slug: "re-6",
    segment: "reeng",
    customerId: "cust-shreya-b",
    orderId: "ORD-9510",
    name: "Shreya B",
    phone: "+91 98400 22206",
    email: "shreya.demo@aarla.test",
    reason: "No purchase in 90+ days — WhatsApp preferred",
    lastOrderDate: "2026-02-28",
    products: "Previously: Amman Stories book",
  },
  {
    slug: "re-7",
    segment: "reeng",
    customerId: "cust-gopal-a",
    name: "Gopal A",
    phone: "+91 98400 22207",
    reason: "No purchase in 90+ days — temple essentials",
    lastOrderDate: "2026-03-05",
    products: "Previously: Ganapathi magnets",
  },
  {
    slug: "re-8",
    segment: "reeng",
    customerId: "cust-revathi-s",
    orderId: "ORD-9402",
    name: "Revathi S",
    phone: "+91 98400 22208",
    reason: "No purchase in 90+ days — family gifting",
    lastOrderDate: "2026-04-08",
    products: "Previously: hamper set",
  },
  {
    slug: "re-9",
    segment: "reeng",
    customerId: "cust-imran-h",
    name: "Imran H",
    phone: "+91 98400 22209",
    email: "imran.demo@aarla.test",
    reason: "No purchase in 90+ days — corporate HR sample buyer",
    lastOrderDate: "2026-03-18",
    products: "Previously: thank-you cards ×50",
  },
  {
    slug: "re-10",
    segment: "reeng",
    customerId: "cust-kavitha-l",
    name: "Kavitha L",
    phone: "+91 98400 22210",
    reason: "No purchase in 90+ days",
    lastOrderDate: "2026-04-12",
    products: "Previously: Lakshmi world items",
  },
];

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

  console.log(`[seed-db] customer_call_queue_items (${QUEUE.length})…`);
  for (const row of QUEUE) {
    const segmentId = row.segment === "delivery" ? DELIVERY_SEG : REENG_SEG;
    await client.query(
      `insert into customer_call_queue_items (
        id, organization_id, segment_id, external_customer_id, external_order_id,
        customer_name, phone, email, reason, last_order_date, delivered_at,
        products_summary, status, assigned_to
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',null)
      on conflict do nothing`,
      [
        stableId(`call-q:${row.slug}`),
        ORG_ID,
        segmentId,
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
