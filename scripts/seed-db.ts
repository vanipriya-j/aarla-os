/**
 * Seed Postgres with Aarla OS demo data (local or Supabase Cloud).
 *
 * Usage: npx tsx scripts/seed-db.ts
 * Env:   DATABASE_URL or SUPABASE_DB_URL
 */
import { Client } from "pg";
import { shouldUseSsl } from "../src/lib/infra/db/env";
import {
  batches,
  locations,
  organizations as institutions,
  partners,
  peopleSeed,
  products,
  purchaseOrdersSeed,
  registrationsSeed,
  vendors,
} from "../src/lib/domain/catalog";
import { movementsSeed } from "../src/lib/domain/ledger";
import {
  attentionItems,
  channelMix,
  contentTasks,
  dashboardMetrics,
  launchChecklists,
  priorities,
  projects,
  revenueByMonth,
  sampleAdvice,
  shopifyOrders,
  tipPrompts,
} from "../src/lib/mock-data";
import { ORG_CODE, ORG_ID, stableId } from "./lib/ids";

const DATABASE_URL =
  process.env.DATABASE_URL?.trim() ||
  process.env.SUPABASE_DB_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Story hamper options (from src/app/story/page.tsx — not imported from UI). */
const storyHamperOptions = [
  {
    id: "h1",
    name: "Chennai Classroom Classic",
    products: [
      "Chennai Market Tote",
      "Ganapathi Fridge Magnet Set",
      "Amman Stories — Children's Book",
    ],
    packaging: "Kraft sleeve + mustard ribbon + thank-you card",
    cost: 720,
    sellingPrice: 1450,
    margin: 50.3,
    existingInventory: [
      "Chennai Market Tote (64)",
      "Ganapathi Fridge Magnet Set (210)",
      "Amman Stories (120)",
    ],
    toManufacture: ["Thank-you cards × 100"],
    leadTimeDays: 7,
  },
  {
    id: "h2",
    name: "Ritual Desk Companion",
    products: [
      "Lakshmi Brass Davara Tumbler",
      "Bharatanatyam Gesture Pouch",
      "Ganapathi Fridge Magnet Set",
    ],
    packaging: "Soft beige box + tissue + QR story card",
    cost: 1080,
    sellingPrice: 2200,
    margin: 50.9,
    existingInventory: [
      "Bharatanatyam Gesture Pouch (88)",
      "Ganapathi Fridge Magnet Set (210)",
    ],
    toManufacture: [
      "Lakshmi Brass Davara Tumbler × 82 (reorder)",
      "QR story cards × 100",
    ],
    leadTimeDays: 28,
  },
  {
    id: "h3",
    name: "Festival Light Hamper",
    products: [
      "Muruga Water Bottle — 750ml",
      "Navarathri Magnet Assortment",
      "Story card pack",
    ],
    packaging: "Reusable tote wrap + tissue + festive seal (restrained)",
    cost: 890,
    sellingPrice: 1850,
    margin: 51.9,
    existingInventory: ["Muruga Water Bottle — 750ml (42)"],
    toManufacture: [
      "Navarathri Magnet Assortment × 100",
      "Story card pack × 100",
      "Bottles × 58",
    ],
    leadTimeDays: 18,
  },
] as const;

function log(msg: string) {
  console.log(`[seed-db] ${msg}`);
}

function emptyToNull(value: string | undefined | null): string | null {
  if (value == null || value === "") return null;
  return value;
}

function productIdByTitle(title: string): string | null {
  const p = products.find((x) => x.title === title);
  return p ? stableId(p.id) : null;
}

function vendorIdByName(name: string): string | null {
  const v = vendors.find((x) => x.name === name);
  return v ? stableId(v.id) : null;
}

function urgencyTone(urgency: string): string {
  switch (urgency) {
    case "High":
      return "danger";
    case "Medium":
      return "warning";
    case "Low":
      return "neutral";
    default:
      return "neutral";
  }
}

async function truncateAll(client: Client) {
  // TRUNCATE (not DELETE): stock_movements blocks DELETE via trigger.
  log("truncating all tables (CASCADE)…");
  await client.query(`
    truncate table
      story_hamper_options,
      advice_snippets,
      demo_metric_snapshots,
      home_attention_items,
      home_priorities,
      launch_checklists,
      channel_orders,
      content_tasks,
      projects,
      product_registrations,
      people,
      stock_movements,
      purchase_orders,
      manufacturing_batches,
      institutions,
      locations,
      partners,
      product_variants,
      products,
      vendors,
      organizations
    restart identity cascade
  `);
}

async function seed(client: Client) {
  await truncateAll(client);

  // --- organizations (tenant) ---
  log("organizations…");
  await client.query(
    `insert into organizations (id, code, name, is_demo)
     values ($1, $2, $3, true)`,
    [ORG_ID, ORG_CODE, "Aarla"],
  );

  // --- vendors ---
  log(`vendors (${vendors.length})…`);
  for (const v of vendors) {
    await client.query(
      `insert into vendors (
        id, organization_id, code, name, city, category, contact,
        moq, lead_time_days, quality_rating
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        stableId(v.id),
        ORG_ID,
        v.id,
        v.name,
        v.city,
        v.category,
        v.contact,
        v.moq,
        v.leadTimeDays,
        v.qualityRating,
      ],
    );
  }

  // --- products + variants ---
  log(`products (${products.length})…`);
  let variantCount = 0;
  for (const p of products) {
    await client.query(
      `insert into products (
        id, organization_id, code, sku, title, category, world, story,
        selling_price, cost, velocity, status, idea_origin, designed_date
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        stableId(p.id),
        ORG_ID,
        p.id,
        p.sku,
        p.title,
        p.category,
        p.world,
        p.story,
        p.sellingPrice,
        p.cost,
        p.velocity,
        p.status,
        p.ideaOrigin ?? null,
        emptyToNull(p.designedDate),
      ],
    );
    for (const variant of p.variants) {
      await client.query(
        `insert into product_variants (
          id, organization_id, product_id, code, label, sku
        ) values ($1,$2,$3,$4,$5,$6)`,
        [
          stableId(variant.id),
          ORG_ID,
          stableId(p.id),
          variant.id,
          variant.label,
          variant.sku,
        ],
      );
      variantCount += 1;
    }
  }
  log(`product_variants (${variantCount})…`);

  // --- partners ---
  log(`partners (${partners.length})…`);
  for (const partner of partners) {
    await client.query(
      `insert into partners (
        id, organization_id, code, name, partner_type, location_label, contact,
        payment_status, margin, merchandising_notes, products_sold,
        replenishment_history, display_photos
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)`,
      [
        stableId(partner.id),
        ORG_ID,
        partner.id,
        partner.name,
        partner.partnerType,
        partner.location,
        partner.contact,
        partner.paymentStatus,
        partner.margin,
        partner.merchandisingNotes,
        partner.productsSold,
        JSON.stringify(partner.replenishmentHistory),
        JSON.stringify(partner.displayPhotos),
      ],
    );
  }

  // --- locations (resolve partner_id) ---
  log(`locations (${locations.length})…`);
  for (const loc of locations) {
    const partnerId = loc.partnerId ? stableId(loc.partnerId) : null;
    await client.query(
      `insert into locations (
        id, organization_id, code, name, kind, partner_id
      ) values ($1,$2,$3,$4,$5,$6)`,
      [stableId(loc.id), ORG_ID, loc.id, loc.name, loc.kind, partnerId],
    );
  }

  // --- institutions (catalog organizations) ---
  log(`institutions (${institutions.length})…`);
  for (const org of institutions) {
    await client.query(
      `insert into institutions (
        id, organization_id, code, name, institution_type, contact, city,
        orders, users_reached
      ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        stableId(org.id),
        ORG_ID,
        org.id,
        org.name,
        org.type,
        org.contact,
        org.city ?? null,
        JSON.stringify(org.orders),
        org.usersReached,
      ],
    );
  }

  // --- manufacturing batches ---
  log(`manufacturing_batches (${batches.length})…`);
  for (const b of batches) {
    await client.query(
      `insert into manufacturing_batches (
        id, organization_id, code, batch_number, product_id, vendor_id,
        manufacture_date, received_date, quantity_produced, accepted, damaged, notes
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        stableId(b.id),
        ORG_ID,
        b.id,
        b.batchNumber,
        stableId(b.productId),
        stableId(b.vendorId),
        emptyToNull(b.manufactureDate),
        emptyToNull(b.receivedDate),
        b.quantityProduced,
        b.accepted,
        b.damaged,
        b.notes,
      ],
    );
  }

  // --- purchase orders ---
  log(`purchase_orders (${purchaseOrdersSeed.length})…`);
  for (const po of purchaseOrdersSeed) {
    await client.query(
      `insert into purchase_orders (
        id, organization_id, code, vendor_id, product_id, batch_id,
        quantity_ordered, quantity_received, unit_cost, status,
        required_date, ordered_date
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        stableId(po.id),
        ORG_ID,
        po.id,
        stableId(po.vendorId),
        stableId(po.productId),
        po.batchId ? stableId(po.batchId) : null,
        po.quantityOrdered,
        po.quantityReceived,
        po.unitCost,
        po.status,
        emptyToNull(po.requiredDate),
        emptyToNull(po.orderedDate),
      ],
    );
  }

  // --- stock movements ---
  log(`stock_movements (${movementsSeed.length})…`);
  for (const m of movementsSeed) {
    await client.query(
      `insert into stock_movements (
        id, organization_id, code, movement_date, product_id, variant_id, batch_id,
        quantity, from_location_id, to_location_id, movement_type, reference, notes
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        stableId(m.id),
        ORG_ID,
        m.id,
        m.date,
        stableId(m.productId),
        m.variantId ? stableId(m.variantId) : null,
        m.batchId ? stableId(m.batchId) : null,
        m.quantity,
        stableId(m.fromLocationId),
        stableId(m.toLocationId),
        m.movementType,
        m.reference,
        m.notes,
      ],
    );
  }

  // --- people ---
  log(`people (${peopleSeed.length})…`);
  for (const person of peopleSeed) {
    const owned = person.ownedProducts.map((code) => stableId(code));
    const registered = person.registeredProducts.map((code) => stableId(code));
    await client.query(
      `insert into people (
        id, organization_id, code, name, email, phone, city, roles, interests,
        purchased_orders, owned_products, registered_products, timeline, person_created_on
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
      [
        stableId(person.id),
        ORG_ID,
        person.id,
        person.name,
        person.email,
        person.phone,
        person.city,
        person.roles,
        person.interests,
        person.purchasedOrders,
        owned,
        registered,
        JSON.stringify(person.timeline ?? []),
        emptyToNull(person.createdAt),
      ],
    );
  }

  // --- product registrations ---
  log(`product_registrations (${registrationsSeed.length})…`);
  for (const reg of registrationsSeed) {
    await client.query(
      `insert into product_registrations (
        id, organization_id, code, product_id, batch_id, customer_id, user_id,
        partner_id, institution_id, purchase_source, registration_date,
        registration_code, status
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        stableId(reg.registrationId),
        ORG_ID,
        reg.registrationId,
        stableId(reg.productId),
        reg.batchId ? stableId(reg.batchId) : null,
        reg.customerId ? stableId(reg.customerId) : null,
        stableId(reg.userId),
        reg.partnerId ? stableId(reg.partnerId) : null,
        reg.organizationId ? stableId(reg.organizationId) : null,
        reg.purchaseSource,
        reg.registrationDate,
        reg.registrationCode,
        reg.status,
      ],
    );
  }

  // --- projects ---
  log(`projects (${projects.length})…`);
  for (const project of projects) {
    const linkedProductIds = project.linkedProducts
      .map(productIdByTitle)
      .filter((id): id is string => id != null);
    const vendorIds = project.vendors
      .map(vendorIdByName)
      .filter((id): id is string => id != null);
    await client.query(
      `insert into projects (
        id, organization_id, code, name, status, deadline, budget, capital_committed,
        linked_product_ids, vendor_ids, tasks, manufacturing_orders, content_task_codes,
        risks, notes, world, is_demo
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,true)`,
      [
        stableId(project.id),
        ORG_ID,
        project.id,
        project.name,
        project.status,
        emptyToNull(project.deadline),
        project.budget,
        project.capitalCommitted,
        linkedProductIds,
        vendorIds,
        JSON.stringify(project.tasks),
        project.manufacturingOrders,
        project.contentTasks,
        project.risks,
        project.notes,
        project.world ?? null,
      ],
    );
  }

  // --- content tasks ---
  log(`content_tasks (${contentTasks.length})…`);
  for (const task of contentTasks) {
    const productId = task.product ? productIdByTitle(task.product) : null;
    await client.query(
      `insert into content_tasks (
        id, organization_id, code, title, product_id, world, platform, format,
        due_date, status, caption_draft, assets, is_demo
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,true)`,
      [
        stableId(task.id),
        ORG_ID,
        task.id,
        task.title,
        productId,
        task.world ?? null,
        task.platform,
        task.format,
        emptyToNull(task.dueDate),
        task.status,
        task.captionDraft,
        JSON.stringify(task.assets),
      ],
    );
  }

  // --- channel orders (shopify) ---
  log(`channel_orders (${shopifyOrders.length})…`);
  for (const order of shopifyOrders) {
    await client.query(
      `insert into channel_orders (
        id, organization_id, code, customer_name, line_items, payment_status,
        order_date, delivery_city, package_weight_kg, courier_status, total, is_demo
      ) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,true)`,
      [
        stableId(order.id),
        ORG_ID,
        order.id,
        order.customer,
        JSON.stringify(order.products),
        order.paymentStatus,
        emptyToNull(order.orderDate),
        order.deliveryCity,
        order.packageWeightKg,
        order.courierStatus,
        order.total,
      ],
    );
  }

  // --- launch checklists ---
  log(`launch_checklists (${launchChecklists.length})…`);
  for (const lc of launchChecklists) {
    const productId = productIdByTitle(lc.productName);
    const flags = {
      productName: lc.productName,
      category: lc.category,
      world: lc.world,
      story: lc.story,
      description: lc.description,
      sellingPrice: lc.sellingPrice,
      cost: lc.cost,
      inventory: lc.inventory,
      photosReady: lc.photosReady,
      barcodeReady: lc.barcodeReady,
      shopifyReady: lc.shopifyReady,
      contentReady: lc.contentReady,
    };
    await client.query(
      `insert into launch_checklists (
        id, organization_id, code, product_id, launch_date, blockers, flags, is_demo
      ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,true)`,
      [
        stableId(lc.id),
        ORG_ID,
        lc.id,
        productId,
        emptyToNull(lc.launchDate),
        lc.blockers,
        JSON.stringify(flags),
      ],
    );
  }

  // --- home priorities ---
  log(`home_priorities (${priorities.length})…`);
  for (let i = 0; i < priorities.length; i++) {
    const pr = priorities[i];
    await client.query(
      `insert into home_priorities (
        id, organization_id, code, title, detail, tone, href, sort_order, is_demo
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [
        stableId(pr.id),
        ORG_ID,
        pr.id,
        pr.title,
        pr.source,
        urgencyTone(pr.urgency),
        pr.href,
        i,
      ],
    );
  }

  // --- home attention items ---
  log(`home_attention_items (${attentionItems.length})…`);
  for (let i = 0; i < attentionItems.length; i++) {
    const item = attentionItems[i];
    await client.query(
      `insert into home_attention_items (
        id, organization_id, code, title, detail, href, sort_order, is_demo
      ) values ($1,$2,$3,$4,$5,$6,$7,true)`,
      [
        stableId(item.id),
        ORG_ID,
        item.id,
        item.title,
        item.detail,
        item.href,
        i,
      ],
    );
  }

  // --- demo metric snapshots ---
  log("demo_metric_snapshots…");
  const metricRows: { kind: string; payload: unknown }[] = [
    { kind: "dashboard", payload: dashboardMetrics },
    { kind: "revenue_by_month", payload: revenueByMonth },
    { kind: "channel_mix", payload: channelMix },
  ];
  for (const row of metricRows) {
    await client.query(
      `insert into demo_metric_snapshots (
        id, organization_id, kind, payload, is_demo
      ) values ($1,$2,$3,$4::jsonb,true)`,
      [stableId(`metric-${row.kind}`), ORG_ID, row.kind, JSON.stringify(row.payload)],
    );
  }

  // --- advice snippets (sampleAdvice + tipPrompts as separate rows) ---
  const adviceEntries = Object.entries(sampleAdvice);
  log(`advice_snippets (advice=${adviceEntries.length}, tips=${tipPrompts.length})…`);
  for (let i = 0; i < adviceEntries.length; i++) {
    const [key, value] = adviceEntries[i];
    const code = `advice-${i + 1}`;
    await client.query(
      `insert into advice_snippets (
        id, organization_id, code, match_key, title, body, is_demo
      ) values ($1,$2,$3,$4,$5,$6,true)`,
      [
        stableId(code),
        ORG_ID,
        code,
        key,
        key,
        JSON.stringify({ answer: value.answer, actions: value.actions }),
      ],
    );
  }
  for (let i = 0; i < tipPrompts.length; i++) {
    const prompt = tipPrompts[i];
    const code = `tip-${i + 1}`;
    await client.query(
      `insert into advice_snippets (
        id, organization_id, code, match_key, title, body, is_demo
      ) values ($1,$2,$3,$4,$5,$6,true)`,
      [stableId(code), ORG_ID, code, "tip_prompt", prompt, prompt],
    );
  }

  // --- story hamper options ---
  log(`story_hamper_options (${storyHamperOptions.length})…`);
  for (const opt of storyHamperOptions) {
    await client.query(
      `insert into story_hamper_options (
        id, organization_id, code, title, payload, is_demo
      ) values ($1,$2,$3,$4,$5::jsonb,true)`,
      [
        stableId(opt.id),
        ORG_ID,
        opt.id,
        opt.name,
        JSON.stringify(opt),
      ],
    );
  }
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  });
  log(`connecting to ${DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}`);
  await client.connect();

  try {
    await client.query("begin");
    try {
      await seed(client);
      await client.query("commit");
      log("seed complete");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[seed-db] FAILED:", err);
  process.exit(1);
});
