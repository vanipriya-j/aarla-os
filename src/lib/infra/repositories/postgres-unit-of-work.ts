import type { PoolClient, QueryResultRow } from "pg";
import type {
  Location,
  ManufacturingBatch,
  Partner,
  Person,
  Product,
  ProductRegistration,
  PurchaseOrder,
  ReorderRule,
  StockMovement,
  Vendor,
} from "@/lib/domain/types";
import type {
  BatchRepository,
  InstitutionRecord,
  LocationRepository,
  OpsRepository,
  PartnerRepository,
  PersonRepository,
  ProductRepository,
  PurchaseOrderRepository,
  RegistrationRepository,
  ReorderRuleRepository,
  StockMovementRepository,
  UnitOfWork,
  VendorRepository,
} from "@/lib/repositories/types";
import { ORG_ID, stableId } from "@/lib/infra/db/ids";
import { DatabaseUnavailableError } from "@/lib/infra/db/errors";
import { query as poolQuery } from "@/lib/infra/db/pool";

type QueryFn = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function makeQuery(client?: PoolClient): QueryFn {
  if (!client) return poolQuery;
  return async <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => {
    try {
      const result = await client.query<T>(text, params);
      return result.rows;
    } catch (err) {
      if (err instanceof DatabaseUnavailableError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new DatabaseUnavailableError(`Database query failed: ${message}`);
    }
  };
}

function dateStr(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function codesByUuids(
  q: QueryFn,
  table: string,
  ids: string[] | null | undefined,
): Promise<string[]> {
  if (!ids?.length) return [];
  const rows = await q<{ id: string; code: string }>(
    `select id, code from ${table} where organization_id = $1 and id = any($2::uuid[])`,
    [ORG_ID, ids],
  );
  const map = new Map(rows.map((r) => [r.id, r.code]));
  return ids.map((id) => map.get(id)).filter((c): c is string => Boolean(c));
}

function createProductRepo(q: QueryFn): ProductRepository {
  return {
    async list(): Promise<Product[]> {
      const { shopifyAdminProductUrl } = await import("@/lib/adapters/shopify/admin-urls");
      const products = await q<{
        code: string;
        sku: string;
        title: string;
        category: string;
        world: string;
        story: string;
        selling_price: string | number;
        cost: string | number;
        velocity: string;
        status: string;
        idea_origin: string | null;
        designed_date: string | Date | null;
        inventory_presentation: string;
        shopify_product_id: string | null;
        id: string;
      }>(
        `select id, code, sku, title, category, world, story, selling_price, cost,
                velocity, status, idea_origin, designed_date, inventory_presentation,
                shopify_product_id
         from products where organization_id = $1 order by title`,
        [ORG_ID],
      );
      if (!products.length) return [];
      const variants = await q<{
        product_id: string;
        code: string;
        label: string;
        sku: string;
        options: Record<string, string> | null;
      }>(
        `select product_id, code, label, sku, options from product_variants
         where organization_id = $1 order by sku`,
        [ORG_ID],
      );
      const byProduct = new Map<
        string,
        { id: string; label: string; sku: string; options?: Record<string, string> }[]
      >();
      for (const v of variants) {
        const list = byProduct.get(v.product_id) ?? [];
        const options = v.options && Object.keys(v.options).length ? v.options : undefined;
        list.push({ id: v.code, label: v.label, sku: v.sku, options });
        byProduct.set(v.product_id, list);
      }
      return products.map((p) => {
        const shopifyProductId = p.shopify_product_id ?? null;
        return {
          id: p.code,
          sku: p.sku,
          title: p.title,
          category: p.category,
          world: p.world,
          story: p.story,
          variants: byProduct.get(p.id) ?? [],
          sellingPrice: num(p.selling_price),
          cost: num(p.cost),
          velocity: p.velocity as Product["velocity"],
          status: p.status,
          ideaOrigin: p.idea_origin ?? undefined,
          designedDate: p.designed_date ? dateStr(p.designed_date) : undefined,
          inventoryPresentation: (p.inventory_presentation ??
            "auto") as Product["inventoryPresentation"],
          shopifyProductId,
          shopifyAdminUrl: shopifyAdminProductUrl(shopifyProductId),
        };
      });
    },
    async getByCode(code: string): Promise<Product | null> {
      const all = await this.list();
      return all.find((p) => p.id === code) ?? null;
    },
  };
}

function createVendorRepo(q: QueryFn): VendorRepository {
  return {
    async list(): Promise<Vendor[]> {
      const rows = await q<{
        code: string;
        name: string;
        city: string;
        category: string;
        contact: string;
        moq: number;
        lead_time_days: number;
        quality_rating: string | number;
      }>(
        `select code, name, city, category, contact, moq, lead_time_days, quality_rating
         from vendors where organization_id = $1 order by name`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.code,
        name: r.name,
        city: r.city,
        category: r.category,
        contact: r.contact,
        moq: r.moq,
        leadTimeDays: r.lead_time_days,
        qualityRating: num(r.quality_rating),
      }));
    },
    async getByCode(code: string): Promise<Vendor | null> {
      const rows = await this.list();
      return rows.find((v) => v.id === code) ?? null;
    },
  };
}

function createLocationRepo(q: QueryFn): LocationRepository {
  return {
    async list(): Promise<Location[]> {
      const rows = await q<{
        code: string;
        name: string;
        kind: Location["kind"];
        partner_code: string | null;
      }>(
        `select l.code, l.name, l.kind, p.code as partner_code
         from locations l
         left join partners p on p.id = l.partner_id
         where l.organization_id = $1
         order by l.name`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.code,
        name: r.name,
        kind: r.kind,
        partnerId: r.partner_code ?? undefined,
      }));
    },
  };
}

function createPartnerRepo(q: QueryFn): PartnerRepository {
  return {
    async list(): Promise<Partner[]> {
      const rows = await q<{
        code: string;
        name: string;
        partner_type: Partner["partnerType"];
        location_label: string;
        contact: string;
        payment_status: Partner["paymentStatus"];
        margin: string | number;
        merchandising_notes: string;
        products_sold: number;
        replenishment_history: Partner["replenishmentHistory"];
        display_photos: string[];
      }>(
        `select code, name, partner_type, location_label, contact, payment_status,
                margin, merchandising_notes, products_sold, replenishment_history, display_photos
         from partners where organization_id = $1 order by name`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.code,
        name: r.name,
        partnerType: r.partner_type,
        location: r.location_label,
        contact: r.contact,
        paymentStatus: r.payment_status,
        margin: num(r.margin),
        merchandisingNotes: r.merchandising_notes,
        productsSold: r.products_sold,
        replenishmentHistory: Array.isArray(r.replenishment_history)
          ? r.replenishment_history
          : [],
        displayPhotos: Array.isArray(r.display_photos) ? r.display_photos : [],
      }));
    },
    async getByCode(code: string): Promise<Partner | null> {
      const all = await this.list();
      return all.find((p) => p.id === code) ?? null;
    },
    async create(input: {
      name: string;
      partnerType?: Partner["partnerType"];
      locationLabel?: string;
      contact?: string;
      margin?: number;
      merchandisingNotes?: string;
      code?: string;
    }): Promise<Partner> {
      const baseSlug =
        (input.code?.trim() ||
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40)) ||
        `partner-${Date.now().toString(36)}`;
      let code = baseSlug.startsWith("partner-") ? baseSlug : `partner-${baseSlug}`;
      if (await this.getByCode(code)) {
        code = `${code}-${Date.now().toString(36).slice(-4)}`;
      }
      // Matches seed pattern: partner-freshly → loc-partner-freshly
      const locationCode = `loc-${code}`;
      const partnerType = input.partnerType ?? "Retail Partner";
      const locationLabel = input.locationLabel?.trim() || input.name.trim();
      const partnerUuid = stableId(code);
      const locationUuid = stableId(locationCode);

      await q(
        `insert into partners (
           id, organization_id, code, name, partner_type, location_label, contact,
           payment_status, margin, merchandising_notes, products_sold,
           replenishment_history, display_photos
         ) values ($1,$2,$3,$4,$5,$6,$7,'Current',$8,$9,0,'[]'::jsonb,'[]'::jsonb)`,
        [
          partnerUuid,
          ORG_ID,
          code,
          input.name.trim(),
          partnerType,
          locationLabel,
          input.contact?.trim() ?? "",
          input.margin ?? 0,
          input.merchandisingNotes?.trim() ?? "",
        ],
      );

      await q(
        `insert into locations (id, organization_id, code, name, kind, partner_id)
         values ($1,$2,$3,$4,'Partner',$5)`,
        [locationUuid, ORG_ID, locationCode, locationLabel, partnerUuid],
      );

      const created = await this.getByCode(code);
      if (!created) throw new Error("Partner create failed");
      return created;
    },
  };
}

function createBatchRepo(q: QueryFn): BatchRepository {
  return {
    async list(): Promise<ManufacturingBatch[]> {
      const rows = await q<{
        code: string;
        batch_number: string;
        product_code: string;
        vendor_code: string;
        manufacture_date: string | Date | null;
        received_date: string | Date | null;
        quantity_produced: number;
        accepted: number;
        damaged: number;
        notes: string;
      }>(
        `select b.code, b.batch_number, p.code as product_code, v.code as vendor_code,
                b.manufacture_date, b.received_date, b.quantity_produced, b.accepted,
                b.damaged, b.notes
         from manufacturing_batches b
         join products p on p.id = b.product_id
         join vendors v on v.id = b.vendor_id
         where b.organization_id = $1
         order by b.batch_number`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.code,
        batchNumber: r.batch_number,
        productId: r.product_code,
        vendorId: r.vendor_code,
        manufactureDate: dateStr(r.manufacture_date),
        receivedDate: dateStr(r.received_date),
        quantityProduced: r.quantity_produced,
        accepted: r.accepted,
        damaged: r.damaged,
        notes: r.notes,
      }));
    },
  };
}

function mapPoRow(r: {
  code: string;
  vendor_code: string;
  product_code: string;
  batch_code: string | null;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: string | number;
  status: PurchaseOrder["status"];
  required_date: string | Date | null;
  ordered_date: string | Date | null;
}): PurchaseOrder {
  return {
    id: r.code,
    vendorId: r.vendor_code,
    productId: r.product_code,
    quantityOrdered: r.quantity_ordered,
    quantityReceived: r.quantity_received,
    unitCost: num(r.unit_cost),
    status: r.status,
    requiredDate: dateStr(r.required_date),
    orderedDate: dateStr(r.ordered_date),
    batchId: r.batch_code ?? undefined,
  };
}

const PO_SELECT = `
  select po.code, v.code as vendor_code, p.code as product_code, b.code as batch_code,
         po.quantity_ordered, po.quantity_received, po.unit_cost, po.status,
         po.required_date, po.ordered_date
  from purchase_orders po
  join vendors v on v.id = po.vendor_id
  join products p on p.id = po.product_id
  left join manufacturing_batches b on b.id = po.batch_id
`;

function createPurchaseOrderRepo(q: QueryFn): PurchaseOrderRepository {
  return {
    async list(): Promise<PurchaseOrder[]> {
      const rows = await q<Parameters<typeof mapPoRow>[0]>(
        `${PO_SELECT} where po.organization_id = $1 order by po.ordered_date desc nulls last, po.code`,
        [ORG_ID],
      );
      return rows.map(mapPoRow);
    },
    async getByCode(code: string): Promise<PurchaseOrder | null> {
      const rows = await q<Parameters<typeof mapPoRow>[0]>(
        `${PO_SELECT} where po.organization_id = $1 and po.code = $2`,
        [ORG_ID, code],
      );
      return rows[0] ? mapPoRow(rows[0]) : null;
    },
    async upsert(po: PurchaseOrder): Promise<PurchaseOrder> {
      await q(
        `insert into purchase_orders (
           id, organization_id, code, vendor_id, product_id, batch_id,
           quantity_ordered, quantity_received, unit_cost, status,
           required_date, ordered_date
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (organization_id, code) do update set
           vendor_id = excluded.vendor_id,
           product_id = excluded.product_id,
           batch_id = excluded.batch_id,
           quantity_ordered = excluded.quantity_ordered,
           quantity_received = excluded.quantity_received,
           unit_cost = excluded.unit_cost,
           status = excluded.status,
           required_date = excluded.required_date,
           ordered_date = excluded.ordered_date,
           updated_at = now()`,
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
          po.requiredDate || null,
          po.orderedDate || null,
        ],
      );
      return po;
    },
  };
}

function createMovementRepo(q: QueryFn): StockMovementRepository {
  return {
    async list(): Promise<StockMovement[]> {
      const rows = await q<{
        code: string;
        movement_date: string | Date;
        product_code: string;
        variant_code: string | null;
        batch_code: string | null;
        quantity: number;
        from_code: string;
        to_code: string;
        movement_type: StockMovement["movementType"];
        reference: string;
        notes: string;
      }>(
        `select m.code, m.movement_date, p.code as product_code, pv.code as variant_code,
                b.code as batch_code, m.quantity, fl.code as from_code, tl.code as to_code,
                m.movement_type, m.reference, m.notes
         from stock_movements m
         join products p on p.id = m.product_id
         join locations fl on fl.id = m.from_location_id
         join locations tl on tl.id = m.to_location_id
         left join product_variants pv on pv.id = m.variant_id
         left join manufacturing_batches b on b.id = m.batch_id
         where m.organization_id = $1
         order by m.movement_date asc, m.created_at asc`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.code,
        date: dateStr(r.movement_date),
        productId: r.product_code,
        variantId: r.variant_code ?? undefined,
        batchId: r.batch_code ?? undefined,
        quantity: r.quantity,
        fromLocationId: r.from_code,
        toLocationId: r.to_code,
        movementType: r.movement_type,
        reference: r.reference,
        notes: r.notes,
      }));
    },
    async append(movements: StockMovement[]): Promise<void> {
      for (const m of movements) {
        await q(
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
            m.notes ?? "",
          ],
        );
      }
    },
  };
}

function createPersonRepo(q: QueryFn): PersonRepository {
  async function mapPerson(r: {
    code: string;
    name: string;
    email: string;
    phone: string;
    city: string;
    roles: string[];
    interests: string[];
    purchased_orders: string[];
    owned_products: string[];
    registered_products: string[];
    timeline: Person["timeline"];
    person_created_on: string | Date | null;
  }): Promise<Person> {
    const owned = await codesByUuids(q, "products", r.owned_products);
    const registered = await codesByUuids(q, "products", r.registered_products);
    return {
      id: r.code,
      name: r.name,
      email: r.email,
      phone: r.phone,
      city: r.city,
      roles: r.roles as Person["roles"],
      interests: r.interests as Person["interests"],
      purchasedOrders: r.purchased_orders ?? [],
      ownedProducts: owned,
      registeredProducts: registered,
      createdAt: dateStr(r.person_created_on) || dateStr(new Date()),
      timeline: Array.isArray(r.timeline) ? r.timeline : [],
    };
  }

  const selectCols = `
    code, name, email, phone, city, roles, interests, purchased_orders,
    owned_products, registered_products, timeline, person_created_on
  `;

  return {
    async list(): Promise<Person[]> {
      const rows = await q<Parameters<typeof mapPerson>[0]>(
        `select ${selectCols} from people where organization_id = $1 order by name`,
        [ORG_ID],
      );
      return Promise.all(rows.map(mapPerson));
    },
    async getByCode(code: string): Promise<Person | null> {
      const rows = await q<Parameters<typeof mapPerson>[0]>(
        `select ${selectCols} from people where organization_id = $1 and code = $2`,
        [ORG_ID, code],
      );
      return rows[0] ? mapPerson(rows[0]) : null;
    },
    async findByEmail(email: string): Promise<Person | null> {
      const rows = await q<Parameters<typeof mapPerson>[0]>(
        `select ${selectCols} from people
         where organization_id = $1 and lower(email) = lower($2)`,
        [ORG_ID, email.trim()],
      );
      return rows[0] ? mapPerson(rows[0]) : null;
    },
    async upsert(person: Person): Promise<Person> {
      const owned = person.ownedProducts.map((c) => stableId(c));
      const registered = person.registeredProducts.map((c) => stableId(c));
      await q(
        `insert into people (
           id, organization_id, code, name, email, phone, city, roles, interests,
           purchased_orders, owned_products, registered_products, timeline, person_created_on
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
         on conflict (organization_id, code) do update set
           name = excluded.name,
           email = excluded.email,
           phone = excluded.phone,
           city = excluded.city,
           roles = excluded.roles,
           interests = excluded.interests,
           purchased_orders = excluded.purchased_orders,
           owned_products = excluded.owned_products,
           registered_products = excluded.registered_products,
           timeline = excluded.timeline,
           person_created_on = excluded.person_created_on,
           updated_at = now()`,
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
          person.createdAt || null,
        ],
      );
      return person;
    },
  };
}

function createRegistrationRepo(q: QueryFn): RegistrationRepository {
  async function mapReg(r: {
    code: string;
    product_code: string;
    batch_code: string | null;
    customer_code: string | null;
    user_code: string;
    partner_code: string | null;
    institution_code: string | null;
    purchase_source: ProductRegistration["purchaseSource"];
    registration_date: string | Date;
    registration_code: string;
    status: ProductRegistration["status"];
  }): Promise<ProductRegistration> {
    return {
      registrationId: r.code,
      productId: r.product_code,
      batchId: r.batch_code ?? "",
      customerId: r.customer_code ?? undefined,
      organizationId: r.institution_code ?? undefined,
      userId: r.user_code,
      partnerId: r.partner_code ?? undefined,
      purchaseSource: r.purchase_source,
      registrationDate: dateStr(r.registration_date),
      registrationCode: r.registration_code,
      status: r.status,
    };
  }

  const selectSql = `
    select r.code, p.code as product_code, b.code as batch_code,
           c.code as customer_code, u.code as user_code, pt.code as partner_code,
           i.code as institution_code, r.purchase_source, r.registration_date,
           r.registration_code, r.status
    from product_registrations r
    join products p on p.id = r.product_id
    join people u on u.id = r.user_id
    left join manufacturing_batches b on b.id = r.batch_id
    left join people c on c.id = r.customer_id
    left join partners pt on pt.id = r.partner_id
    left join institutions i on i.id = r.institution_id
  `;

  return {
    async list(): Promise<ProductRegistration[]> {
      const rows = await q<Parameters<typeof mapReg>[0]>(
        `${selectSql} where r.organization_id = $1 order by r.registration_date desc`,
        [ORG_ID],
      );
      return Promise.all(rows.map(mapReg));
    },
    async create(reg: ProductRegistration): Promise<ProductRegistration> {
      await q(
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
      return reg;
    },
  };
}

function createReorderRuleRepo(q: QueryFn): ReorderRuleRepository {
  return {
    async list(): Promise<ReorderRule[]> {
      const rows = await q<{
        id: string;
        product_code: string;
        variant_code: string | null;
        partner_code: string | null;
        min_quantity: number;
        notes: string;
      }>(
        `select r.id, p.code as product_code, pv.code as variant_code,
                pt.code as partner_code, r.min_quantity, r.notes
         from inventory_reorder_rules r
         join products p on p.id = r.product_id
         left join product_variants pv on pv.id = r.variant_id
         left join partners pt on pt.id = r.partner_id
         where r.organization_id = $1
         order by p.title`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.id,
        productId: r.product_code,
        variantId: r.variant_code ?? undefined,
        partnerId: r.partner_code ?? undefined,
        minQuantity: r.min_quantity,
        notes: r.notes,
      }));
    },
    async upsert(rule: Omit<ReorderRule, "id"> & { id?: string }): Promise<ReorderRule> {
      const rows = await q<{ id: string }>(
        `insert into inventory_reorder_rules (
           id, organization_id, product_id, variant_id, partner_id, min_quantity, notes
         ) values (
           coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7
         )
         on conflict (
           organization_id, product_id,
           coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
           coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid)
         ) do update set
           min_quantity = excluded.min_quantity,
           notes = excluded.notes,
           updated_at = now()
         returning id`,
        [
          rule.id ?? null,
          ORG_ID,
          stableId(rule.productId),
          rule.variantId ? stableId(rule.variantId) : null,
          rule.partnerId ? stableId(rule.partnerId) : null,
          rule.minQuantity,
          rule.notes ?? "",
        ],
      );
      return {
        id: rows[0]?.id ?? rule.id ?? "",
        productId: rule.productId,
        variantId: rule.variantId,
        partnerId: rule.partnerId,
        minQuantity: rule.minQuantity,
        notes: rule.notes,
      };
    },
  };
}

function createOpsRepo(q: QueryFn): OpsRepository {
  return {
    async listProjects(): Promise<unknown[]> {
      const rows = await q<{
        code: string;
        name: string;
        status: string;
        deadline: string | Date | null;
        budget: string | number;
        capital_committed: string | number;
        linked_product_ids: string[];
        vendor_ids: string[];
        tasks: unknown;
        manufacturing_orders: string[];
        content_task_codes: string[];
        risks: string[];
        notes: string;
        world: string | null;
      }>(
        `select code, name, status, deadline, budget, capital_committed,
                linked_product_ids, vendor_ids, tasks, manufacturing_orders,
                content_task_codes, risks, notes, world
         from projects where organization_id = $1 order by deadline nulls last`,
        [ORG_ID],
      );
      const result = [];
      for (const r of rows) {
        const productTitles = await q<{ title: string }>(
          `select title from products where organization_id = $1 and id = any($2::uuid[])`,
          [ORG_ID, r.linked_product_ids ?? []],
        );
        const vendorNames = await q<{ name: string }>(
          `select name from vendors where organization_id = $1 and id = any($2::uuid[])`,
          [ORG_ID, r.vendor_ids ?? []],
        );
        result.push({
          id: r.code,
          name: r.name,
          status: r.status,
          deadline: dateStr(r.deadline),
          budget: num(r.budget),
          capitalCommitted: num(r.capital_committed),
          linkedProducts: productTitles.map((p) => p.title),
          vendors: vendorNames.map((v) => v.name),
          tasks: Array.isArray(r.tasks) ? r.tasks : [],
          manufacturingOrders: r.manufacturing_orders ?? [],
          contentTasks: r.content_task_codes ?? [],
          risks: r.risks ?? [],
          notes: r.notes,
          world: r.world ?? undefined,
        });
      }
      return result;
    },

    async listContentTasks(): Promise<unknown[]> {
      const rows = await q<{
        code: string;
        title: string;
        product_title: string | null;
        world: string | null;
        platform: string;
        format: string;
        due_date: string | Date | null;
        status: string;
        caption_draft: string;
        assets: unknown;
      }>(
        `select c.code, c.title, p.title as product_title, c.world, c.platform, c.format,
                c.due_date, c.status, c.caption_draft, c.assets
         from content_tasks c
         left join products p on p.id = c.product_id
         where c.organization_id = $1
         order by c.due_date nulls last`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.code,
        title: r.title,
        product: r.product_title ?? undefined,
        world: r.world ?? undefined,
        platform: r.platform,
        format: r.format,
        dueDate: dateStr(r.due_date),
        status: r.status,
        captionDraft: r.caption_draft,
        assets: Array.isArray(r.assets) ? r.assets : [],
      }));
    },

    async listChannelOrders(): Promise<unknown[]> {
      const rows = await q<{
        code: string;
        customer_name: string;
        line_items: unknown;
        payment_status: string;
        order_date: string | Date | null;
        delivery_city: string;
        package_weight_kg: string | number;
        courier_status: string;
        total: string | number;
      }>(
        `select code, customer_name, line_items, payment_status, order_date,
                delivery_city, package_weight_kg, courier_status, total
         from channel_orders where organization_id = $1 order by order_date desc nulls last`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.code,
        customer: r.customer_name,
        products: Array.isArray(r.line_items) ? r.line_items : [],
        paymentStatus: r.payment_status,
        orderDate: dateStr(r.order_date),
        deliveryCity: r.delivery_city,
        packageWeightKg: num(r.package_weight_kg),
        courierStatus: r.courier_status,
        total: num(r.total),
      }));
    },

    async updateChannelOrderStatus(code: string, courierStatus: string): Promise<void> {
      await q(
        `update channel_orders set courier_status = $3, updated_at = now()
         where organization_id = $1 and code = $2`,
        [ORG_ID, code, courierStatus],
      );
    },

    async listLaunchChecklists(): Promise<unknown[]> {
      const rows = await q<{
        code: string;
        launch_date: string | Date | null;
        blockers: string[];
        flags: Record<string, unknown>;
      }>(
        `select code, launch_date, blockers, flags
         from launch_checklists where organization_id = $1 order by launch_date nulls last`,
        [ORG_ID],
      );
      return rows.map((r) => {
        const flags = r.flags ?? {};
        return {
          id: r.code,
          productName: String(flags.productName ?? ""),
          category: String(flags.category ?? ""),
          world: String(flags.world ?? ""),
          story: String(flags.story ?? ""),
          description: String(flags.description ?? ""),
          sellingPrice: num(flags.sellingPrice),
          cost: num(flags.cost),
          inventory: num(flags.inventory),
          photosReady: Boolean(flags.photosReady),
          barcodeReady: Boolean(flags.barcodeReady),
          shopifyReady: Boolean(flags.shopifyReady),
          contentReady: Boolean(flags.contentReady),
          launchDate: dateStr(r.launch_date),
          blockers: r.blockers ?? [],
        };
      });
    },

    async listHomePriorities(): Promise<unknown[]> {
      const rows = await q<{
        code: string;
        title: string;
        detail: string;
        tone: string;
        href: string | null;
      }>(
        `select code, title, detail, tone, href
         from home_priorities where organization_id = $1 order by sort_order`,
        [ORG_ID],
      );
      return rows.map((r) => {
        const urgency =
          r.tone === "danger" ? "High" : r.tone === "warning" ? "Medium" : "Low";
        return {
          id: r.code,
          title: r.title,
          source: r.detail,
          urgency,
          href: r.href ?? "/",
        };
      });
    },

    async listHomeAttention(): Promise<unknown[]> {
      const rows = await q<{
        code: string;
        title: string;
        detail: string;
        href: string | null;
      }>(
        `select code, title, detail, href
         from home_attention_items where organization_id = $1 order by sort_order`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.code,
        title: r.title,
        detail: r.detail,
        tone: "warning" as const,
        href: r.href ?? "/",
      }));
    },

    async getDemoMetrics(): Promise<{
      dashboard: unknown;
      revenueByMonth: unknown;
      channelMix: unknown;
    }> {
      const rows = await q<{ kind: string; payload: unknown }>(
        `select kind, payload from demo_metric_snapshots
         where organization_id = $1 and kind = any($2::text[])`,
        [ORG_ID, ["dashboard", "revenue_by_month", "channel_mix"]],
      );
      const byKind = new Map(rows.map((r) => [r.kind, r.payload]));
      return {
        dashboard: byKind.get("dashboard") ?? {},
        revenueByMonth: byKind.get("revenue_by_month") ?? [],
        channelMix: byKind.get("channel_mix") ?? [],
      };
    },

    async listAdviceSnippets(): Promise<{ matchKey: string; title: string; body: string }[]> {
      const rows = await q<{ match_key: string; title: string; body: string }>(
        `select match_key, title, body from advice_snippets
         where organization_id = $1 and match_key <> 'tip_prompt'
         order by code`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        matchKey: r.match_key,
        title: r.title,
        body: r.body,
      }));
    },

    async listTipPrompts(): Promise<string[]> {
      const rows = await q<{ body: string }>(
        `select body from advice_snippets
         where organization_id = $1 and match_key = 'tip_prompt'
         order by code`,
        [ORG_ID],
      );
      return rows.map((r) => r.body);
    },

    async listStoryHampers(): Promise<unknown[]> {
      const rows = await q<{ code: string; title: string; payload: unknown }>(
        `select code, title, payload from story_hamper_options
         where organization_id = $1 order by code`,
        [ORG_ID],
      );
      return rows.map((r) => {
        if (r.payload && typeof r.payload === "object") {
          return { ...(r.payload as object), id: r.code, name: r.title };
        }
        return { id: r.code, name: r.title };
      });
    },

    async listInstitutions(): Promise<InstitutionRecord[]> {
      const rows = await q<{
        code: string;
        name: string;
        institution_type: string;
        contact: string;
        orders: unknown;
        users_reached: number;
        city: string | null;
      }>(
        `select code, name, institution_type, contact, orders, users_reached, city
         from institutions where organization_id = $1 order by name`,
        [ORG_ID],
      );
      return rows.map((r) => ({
        id: r.code,
        name: r.name,
        type: r.institution_type,
        contact: r.contact,
        orders: Array.isArray(r.orders) ? (r.orders as string[]) : [],
        usersReached: r.users_reached,
        city: r.city ?? undefined,
      }));
    },
  };
}

/** Create a UnitOfWork backed by Postgres. Pass a transaction client for atomic writes. */
export function createPostgresUnitOfWork(client?: PoolClient): UnitOfWork {
  const q = makeQuery(client);
  return {
    products: createProductRepo(q),
    vendors: createVendorRepo(q),
    locations: createLocationRepo(q),
    partners: createPartnerRepo(q),
    batches: createBatchRepo(q),
    purchaseOrders: createPurchaseOrderRepo(q),
    movements: createMovementRepo(q),
    people: createPersonRepo(q),
    registrations: createRegistrationRepo(q),
    reorderRules: createReorderRuleRepo(q),
    ops: createOpsRepo(q),
  };
}
