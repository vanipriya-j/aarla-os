/**
 * Postgres repositories for Manufacture / Reorder domain.
 */
import "server-only";
import { query } from "@/lib/infra/db/pool";
import { ORG_ID } from "@/lib/infra/db/ids";
import { ensureTenantBasicsViaPool } from "@/lib/infra/db/ensure-tenant";
import type {
  MfgVendorProfile,
  ProductionRequirement,
  VendorOrder,
  VendorOrderCommunication,
  VendorOrderItem,
  VendorOrderPdfVersion,
  VendorPayment,
  WorkflowInstance,
  WorkflowInstanceStep,
  WorkflowTemplate,
  WorkflowTemplateStep,
  VendorWorkflowAiDraft,
} from "@/lib/domain/manufacture-types";

function dateStr(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

function iso(v: string | Date | null | undefined): string {
  if (!v) return new Date().toISOString();
  if (typeof v === "string") return v;
  return v.toISOString();
}

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

let schemaReady = false;
export async function ensureManufactureSchema(): Promise<void> {
  if (schemaReady) return;
  await ensureTenantBasicsViaPool();
  // Best-effort so Save Workflow works even before a full /setup migrate.
  const alters = [
    `alter table vendors add column if not exists business_name text not null default ''`,
    `alter table vendors add column if not exists contact_person text not null default ''`,
    `alter table vendors add column if not exists phone text not null default ''`,
    `alter table vendors add column if not exists whatsapp_number text not null default ''`,
    `alter table vendors add column if not exists email text not null default ''`,
    `alter table vendors add column if not exists address text not null default ''`,
    `alter table vendors add column if not exists gstin text not null default ''`,
    `alter table vendors add column if not exists what_they_make text not null default ''`,
    `alter table vendors add column if not exists payment_terms text not null default ''`,
    `alter table vendors add column if not exists advance_percentage numeric(5,2)`,
    `alter table vendors add column if not exists notes text not null default ''`,
    `alter table vendors add column if not exists is_active boolean not null default true`,
    `alter table vendors add column if not exists how_they_work text not null default ''`,
    `alter table vendors add column if not exists workflow_template_id uuid`,
    `alter table vendors add column if not exists stated_lead_time_days integer`,
    `alter table vendors add column if not exists internal_buffer_days integer not null default 21`,
  ];
  for (const sql of alters) {
    await query(sql).catch(() => undefined);
  }
  await query(`
    create table if not exists workflow_templates (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references organizations(id) on delete cascade,
      code text not null,
      name text not null,
      vendor_id uuid references vendors(id) on delete set null,
      source_description text not null default '',
      vendor_lead_time_days integer,
      internal_buffer_days integer not null default 21,
      advance_percentage numeric(5,2),
      status text not null default 'draft'
        check (status in ('draft', 'approved', 'archived')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, code)
    )`).catch(() => undefined);
  await query(`
    create table if not exists workflow_template_steps (
      id uuid primary key default gen_random_uuid(),
      workflow_template_id uuid not null references workflow_templates(id) on delete cascade,
      sequence integer not null,
      name text not null,
      step_type text not null,
      responsibility text not null default 'aarla'
        check (responsibility in ('aarla', 'vendor', 'either')),
      required boolean not null default true,
      payment_percentage numeric(5,2),
      requires_approval boolean not null default false,
      requires_attachment boolean not null default false,
      requires_vendor_confirmation boolean not null default false,
      updates_order_status text,
      notes text not null default '',
      unique (workflow_template_id, sequence)
    )`).catch(() => undefined);
  schemaReady = true;
}

export async function getWorkflowTemplateForVendor(
  vendorCode: string,
): Promise<WorkflowTemplate | null> {
  await ensureManufactureSchema();
  const rows = await query<{ code: string }>(
    `select wt.code
     from vendors v
     join workflow_templates wt on wt.id = v.workflow_template_id
     where v.organization_id = $1 and v.code = $2
     limit 1`,
    [ORG_ID, vendorCode],
  ).catch(() => [] as { code: string }[]);
  if (rows[0]?.code) return getWorkflowTemplateByCode(rows[0].code);
  // Fallback: latest approved template for this vendor
  const fallback = await query<{ code: string }>(
    `select wt.code
     from workflow_templates wt
     join vendors v on v.id = wt.vendor_id
     where wt.organization_id = $1 and v.code = $2 and wt.status = 'approved'
     order by wt.updated_at desc
     limit 1`,
    [ORG_ID, vendorCode],
  ).catch(() => [] as { code: string }[]);
  if (!fallback[0]?.code) return null;
  return getWorkflowTemplateByCode(fallback[0].code);
}

function mapVendor(r: Record<string, unknown>): MfgVendorProfile {
  return {
    id: String(r.code),
    name: String(r.name ?? ""),
    businessName: String(r.business_name ?? ""),
    contactPerson: String(r.contact_person ?? ""),
    phone: String(r.phone ?? ""),
    whatsappNumber: String(r.whatsapp_number ?? r.phone ?? r.contact ?? ""),
    email: String(r.email ?? ""),
    city: String(r.city ?? ""),
    address: String(r.address ?? ""),
    gstin: String(r.gstin ?? ""),
    category: String(r.category ?? ""),
    whatTheyMake: String(r.what_they_make ?? r.category ?? ""),
    categoriesSupported: Array.isArray(r.categories_supported)
      ? (r.categories_supported as string[])
      : [],
    productsSupported: Array.isArray(r.products_supported)
      ? (r.products_supported as string[])
      : [],
    moq: Number(r.moq ?? 0),
    leadTimeDays: Number(r.lead_time_days ?? 0),
    statedLeadTimeDays: num(r.stated_lead_time_days as string | number | null),
    internalBufferDays: Number(r.internal_buffer_days ?? 21),
    paymentTerms: String(r.payment_terms ?? ""),
    advancePercentage: num(r.advance_percentage as string | number | null),
    preferredShippingMethod: String(r.preferred_shipping_method ?? ""),
    notes: String(r.notes ?? ""),
    howTheyWork: String(r.how_they_work ?? ""),
    active: r.is_active !== false,
    qualityRating: Number(r.quality_rating ?? 0),
    workflowTemplateId: r.workflow_template_code
      ? String(r.workflow_template_code)
      : null,
    contact: String(r.contact ?? ""),
  };
}

export async function listMfgVendors(): Promise<MfgVendorProfile[]> {
  await ensureManufactureSchema();
  const rows = await query<Record<string, unknown>>(
    `select v.*, wt.code as workflow_template_code
     from vendors v
     left join workflow_templates wt on wt.id = v.workflow_template_id
     where v.organization_id = $1
     order by v.name`,
    [ORG_ID],
  ).catch(async () =>
    query<Record<string, unknown>>(
      `select v.*, null::text as workflow_template_code from vendors v
       where v.organization_id = $1 order by v.name`,
      [ORG_ID],
    ),
  );
  return rows.map(mapVendor);
}

export async function getMfgVendor(code: string): Promise<MfgVendorProfile | null> {
  const all = await listMfgVendors();
  return all.find((v) => v.id === code) ?? null;
}

export async function createMfgVendor(input: {
  code?: string;
  name: string;
  businessName?: string;
  contactPerson?: string;
  phone?: string;
  whatsappNumber?: string;
  email?: string;
  city?: string;
  address?: string;
  category?: string;
  whatTheyMake?: string;
  paymentTerms?: string;
  advancePercentage?: number | null;
  statedLeadTimeDays?: number | null;
  internalBufferDays?: number;
  howTheyWork?: string;
  notes?: string;
}): Promise<MfgVendorProfile> {
  await ensureManufactureSchema();
  const code =
    input.code?.trim() ||
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) ||
    `vendor-${Date.now().toString(36)}`;
  await query(
    `insert into vendors (
       organization_id, code, name, city, category, contact, moq, lead_time_days, quality_rating,
       business_name, contact_person, phone, whatsapp_number, email, address, what_they_make,
       payment_terms, advance_percentage, stated_lead_time_days, internal_buffer_days,
       how_they_work, notes, is_active
     ) values (
       $1,$2,$3,$4,$5,$6,0,coalesce($7,10),0,
       $8,$9,$10,$11,$12,$13,$14,
       $15,$16,$7,$17,
       $18,$19,true
     )
     on conflict (organization_id, code) do update set
       name = excluded.name,
       updated_at = now()`,
    [
      ORG_ID,
      code,
      input.name.trim(),
      input.city ?? "",
      input.category ?? input.whatTheyMake ?? "",
      input.whatsappNumber || input.phone || "",
      input.statedLeadTimeDays ?? 10,
      input.businessName ?? input.name.trim(),
      input.contactPerson ?? "",
      input.phone ?? "",
      input.whatsappNumber ?? input.phone ?? "",
      input.email ?? "",
      input.address ?? "",
      input.whatTheyMake ?? "",
      input.paymentTerms ?? "",
      input.advancePercentage ?? null,
      input.internalBufferDays ?? 21,
      input.howTheyWork ?? "",
      input.notes ?? "",
    ],
  );
  const v = await getMfgVendor(code);
  if (!v) throw new Error("Vendor create failed");
  return v;
}

export async function updateVendorHowTheyWork(
  vendorCode: string,
  howTheyWork: string,
): Promise<MfgVendorProfile | null> {
  await ensureManufactureSchema();
  await query(
    `update vendors set how_they_work = $3, updated_at = now()
     where organization_id = $1 and code = $2`,
    [ORG_ID, vendorCode, howTheyWork],
  );
  return getMfgVendor(vendorCode);
}

export async function updateVendorProfile(
  vendorCode: string,
  patch: Partial<{
    businessName: string;
    contactPerson: string;
    phone: string;
    whatsappNumber: string;
    email: string;
    address: string;
    whatTheyMake: string;
    paymentTerms: string;
    advancePercentage: number | null;
    statedLeadTimeDays: number | null;
    internalBufferDays: number;
    notes: string;
    howTheyWork: string;
  }>,
): Promise<MfgVendorProfile | null> {
  await ensureManufactureSchema();
  await query(
    `update vendors set
       business_name = coalesce($3, business_name),
       contact_person = coalesce($4, contact_person),
       phone = coalesce($5, phone),
       whatsapp_number = coalesce($6, whatsapp_number),
       email = coalesce($7, email),
       address = coalesce($8, address),
       what_they_make = coalesce($9, what_they_make),
       payment_terms = coalesce($10, payment_terms),
       advance_percentage = coalesce($11, advance_percentage),
       stated_lead_time_days = coalesce($12, stated_lead_time_days),
       internal_buffer_days = coalesce($13, internal_buffer_days),
       notes = coalesce($14, notes),
       how_they_work = coalesce($15, how_they_work),
       updated_at = now()
     where organization_id = $1 and code = $2`,
    [
      ORG_ID,
      vendorCode,
      patch.businessName ?? null,
      patch.contactPerson ?? null,
      patch.phone ?? null,
      patch.whatsappNumber ?? null,
      patch.email ?? null,
      patch.address ?? null,
      patch.whatTheyMake ?? null,
      patch.paymentTerms ?? null,
      patch.advancePercentage ?? null,
      patch.statedLeadTimeDays ?? null,
      patch.internalBufferDays ?? null,
      patch.notes ?? null,
      patch.howTheyWork ?? null,
    ],
  );
  return getMfgVendor(vendorCode);
}

async function vendorUuid(code: string): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `select id from vendors where organization_id = $1 and code = $2 limit 1`,
    [ORG_ID, code],
  );
  return rows[0]?.id ?? null;
}

async function productUuid(code: string): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `select id from products where organization_id = $1 and code = $2 limit 1`,
    [ORG_ID, code],
  );
  return rows[0]?.id ?? null;
}

export async function saveWorkflowTemplateFromDraft(input: {
  vendorCode: string;
  draft: VendorWorkflowAiDraft;
  approve: boolean;
  sourceDescription?: string;
}): Promise<WorkflowTemplate> {
  await ensureManufactureSchema();
  const vendorId = await vendorUuid(input.vendorCode);
  if (!vendorId) throw new Error("Vendor not found");
  const code = `wf-${input.vendorCode}-${Date.now().toString(36)}`;
  const rows = await query<{ id: string; created_at: Date; updated_at: Date }>(
    `insert into workflow_templates (
       organization_id, code, name, vendor_id, source_description,
       vendor_lead_time_days, internal_buffer_days, advance_percentage, status
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id, created_at, updated_at`,
    [
      ORG_ID,
      code,
      input.draft.name,
      vendorId,
      input.sourceDescription ??
        [
          input.draft.extractedRules.vendorLeadTime,
          input.draft.extractedRules.internalSafetyBuffer,
          input.draft.extractedRules.advance,
        ]
          .filter(Boolean)
          .join(" · "),
      input.draft.vendorLeadTimeDays,
      input.draft.internalBufferDays,
      input.draft.advancePercentage,
      input.approve ? "approved" : "draft",
    ],
  );
  const tplId = rows[0]!.id;
  for (const step of input.draft.steps) {
    await query(
      `insert into workflow_template_steps (
         workflow_template_id, sequence, name, step_type, responsibility, required,
         payment_percentage, requires_approval, requires_attachment,
         requires_vendor_confirmation, notes
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        tplId,
        step.sequence,
        step.name,
        step.stepType,
        step.responsibility,
        step.required,
        step.paymentPercentage,
        step.requiresApproval,
        step.requiresAttachment,
        step.requiresVendorConfirmation,
        step.notes,
      ],
    );
  }
  if (input.approve) {
    await query(
      `update vendors set workflow_template_id = $3, stated_lead_time_days = coalesce($4, stated_lead_time_days),
         internal_buffer_days = coalesce($5, internal_buffer_days),
         advance_percentage = coalesce($6, advance_percentage),
         updated_at = now()
       where organization_id = $1 and id = $2`,
      [
        ORG_ID,
        vendorId,
        tplId,
        input.draft.vendorLeadTimeDays,
        input.draft.internalBufferDays,
        input.draft.advancePercentage,
      ],
    );
  }
  const tpl = await getWorkflowTemplateByCode(code);
  if (!tpl) throw new Error("Failed to load saved workflow");
  return tpl;
}

export async function getWorkflowTemplateByCode(code: string): Promise<WorkflowTemplate | null> {
  const rows = await query<{
    id: string;
    code: string;
    name: string;
    vendor_code: string | null;
    source_description: string;
    vendor_lead_time_days: number | null;
    internal_buffer_days: number;
    advance_percentage: string | number | null;
    status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `select wt.*, v.code as vendor_code
     from workflow_templates wt
     left join vendors v on v.id = wt.vendor_id
     where wt.organization_id = $1 and wt.code = $2 limit 1`,
    [ORG_ID, code],
  );
  const t = rows[0];
  if (!t) return null;
  const steps = await query<{
    id: string;
    sequence: number;
    name: string;
    step_type: string;
    responsibility: string;
    required: boolean;
    payment_percentage: string | number | null;
    requires_approval: boolean;
    requires_attachment: boolean;
    requires_vendor_confirmation: boolean;
    updates_order_status: string | null;
    notes: string;
  }>(
    `select * from workflow_template_steps where workflow_template_id = $1 order by sequence`,
    [t.id],
  );
  return {
    id: t.code,
    code: t.code,
    name: t.name,
    vendorId: t.vendor_code,
    sourceDescription: t.source_description,
    vendorLeadTimeDays: t.vendor_lead_time_days,
    internalBufferDays: t.internal_buffer_days,
    advancePercentage: num(t.advance_percentage),
    status: t.status as WorkflowTemplate["status"],
    steps: steps.map(
      (s): WorkflowTemplateStep => ({
        id: s.id,
        sequence: s.sequence,
        name: s.name,
        stepType: s.step_type as WorkflowTemplateStep["stepType"],
        responsibility: s.responsibility as WorkflowTemplateStep["responsibility"],
        required: s.required,
        paymentPercentage: num(s.payment_percentage),
        requiresApproval: s.requires_approval,
        requiresAttachment: s.requires_attachment,
        requiresVendorConfirmation: s.requires_vendor_confirmation,
        updatesOrderStatus: s.updates_order_status,
        notes: s.notes,
      }),
    ),
    createdAt: iso(t.created_at),
    updatedAt: iso(t.updated_at),
  };
}

export async function listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  await ensureManufactureSchema();
  const rows = await query<{ code: string }>(
    `select code from workflow_templates where organization_id = $1 order by updated_at desc`,
    [ORG_ID],
  ).catch(() => [] as { code: string }[]);
  const out: WorkflowTemplate[] = [];
  for (const r of rows) {
    const t = await getWorkflowTemplateByCode(r.code);
    if (t) out.push(t);
  }
  return out;
}

export async function nextVendorOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await query<{ c: string }>(
    `select count(*)::text as c from vendor_orders where organization_id = $1`,
    [ORG_ID],
  ).catch(() => [{ c: "0" }]);
  const n = Number(rows[0]?.c ?? 0) + 1;
  return `AARLA-MFG-${year.toString().slice(2)}${String(n).padStart(4, "0")}`;
}

export async function createVendorOrder(input: {
  vendorCode: string;
  items: Array<{
    productCode: string;
    variantCode?: string | null;
    title: string;
    variantLabel?: string;
    sku?: string;
    quantity: number;
    unitCost?: number | null;
    colour?: string;
    sizeLabel?: string;
    productionRequirementId?: string | null;
  }>;
  notes?: string;
  requestedDeliveryDate?: string | null;
  createdBy?: string;
}): Promise<VendorOrder> {
  await ensureManufactureSchema();
  const vendorId = await vendorUuid(input.vendorCode);
  if (!vendorId) throw new Error("Vendor not found");
  const vendor = await getMfgVendor(input.vendorCode);
  const orderNumber = await nextVendorOrderNumber();
  const orderDate = new Date().toISOString().slice(0, 10);
  const lead = vendor?.statedLeadTimeDays ?? vendor?.leadTimeDays ?? 10;
  const buffer = vendor?.internalBufferDays ?? 21;
  const requested = input.requestedDeliveryDate ?? null;
  const committed = new Date(Date.now() + lead * 86400000).toISOString().slice(0, 10);
  const internal = new Date(Date.now() + (lead + buffer) * 86400000).toISOString().slice(0, 10);

  let tplUuid: string | null = null;
  if (vendor?.workflowTemplateId) {
    const t = await query<{ id: string }>(
      `select id from workflow_templates where organization_id = $1 and code = $2`,
      [ORG_ID, vendor.workflowTemplateId],
    );
    tplUuid = t[0]?.id ?? null;
  }

  const priced = input.items.every((i) => i.unitCost != null);
  const subtotal = priced
    ? input.items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0)
    : null;
  const advancePct = vendor?.advancePercentage ?? null;
  const advanceAmount =
    subtotal != null && advancePct != null ? Math.round((subtotal * advancePct) / 100) : null;
  const balanceAmount =
    subtotal != null && advanceAmount != null ? subtotal - advanceAmount : null;

  const inserted = await query<{ id: string; created_at: Date; updated_at: Date }>(
    `insert into vendor_orders (
       organization_id, order_number, vendor_id, order_date, status, currency, pricing_status,
       subtotal, total, advance_percentage, advance_amount, balance_amount,
       requested_delivery_date, vendor_committed_date, internal_expected_date,
       notes, workflow_template_id, created_by
     ) values ($1,$2,$3,$4,'draft','INR',$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     returning id, created_at, updated_at`,
    [
      ORG_ID,
      orderNumber,
      vendorId,
      orderDate,
      priced ? "confirmed" : "pending",
      subtotal,
      advancePct,
      advanceAmount,
      balanceAmount,
      requested,
      committed,
      internal,
      input.notes ?? "",
      tplUuid,
      input.createdBy ?? "founder",
    ],
  );
  const orderId = inserted[0]!.id;
  let line = 0;
  for (const item of input.items) {
    line += 1;
    await query(
      `insert into vendor_order_items (
         vendor_order_id, line_number, product_code, variant_code, title, variant_label, sku,
         quantity, unit_cost, line_total, colour, size_label, production_requirement_id
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        orderId,
        line,
        item.productCode,
        item.variantCode ?? null,
        item.title,
        item.variantLabel ?? "",
        item.sku ?? "",
        item.quantity,
        item.unitCost ?? null,
        item.unitCost != null ? item.unitCost * item.quantity : null,
        item.colour ?? "",
        item.sizeLabel ?? "",
        null,
      ],
    );
  }

  // Instantiate workflow if template present
  if (tplUuid) {
    await instantiateWorkflow(orderId, tplUuid);
  }

  if (advanceAmount != null && advanceAmount > 0) {
    await query(
      `insert into vendor_payments (vendor_order_id, stage, amount, percentage, due_when, status)
       values ($1,'ADVANCE',$2,$3,'On confirmation','due')`,
      [orderId, advanceAmount, advancePct],
    );
  }
  if (balanceAmount != null && balanceAmount > 0) {
    await query(
      `insert into vendor_payments (vendor_order_id, stage, amount, percentage, due_when, status)
       values ($1,'BALANCE',$2,$3,'After QC / before dispatch','due')`,
      [orderId, balanceAmount, advancePct != null ? 100 - advancePct : null],
    );
  }

  const order = await getVendorOrder(orderNumber);
  if (!order) throw new Error("Order create failed");
  return order;
}

async function instantiateWorkflow(vendorOrderUuid: string, templateUuid: string): Promise<void> {
  const inst = await query<{ id: string }>(
    `insert into workflow_instances (organization_id, workflow_template_id, vendor_order_id, status, current_step_sequence)
     values ($1,$2,$3,'active',1) returning id`,
    [ORG_ID, templateUuid, vendorOrderUuid],
  );
  const instId = inst[0]!.id;
  const steps = await query<{
    id: string;
    sequence: number;
    name: string;
    step_type: string;
    responsibility: string;
    required: boolean;
    payment_percentage: string | number | null;
    requires_approval: boolean;
    requires_attachment: boolean;
  }>(
    `select * from workflow_template_steps where workflow_template_id = $1 order by sequence`,
    [templateUuid],
  );
  for (const s of steps) {
    await query(
      `insert into workflow_instance_steps (
         workflow_instance_id, template_step_id, sequence, name, step_type, responsibility,
         status, required, payment_percentage, requires_approval, requires_attachment,
         started_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        instId,
        s.id,
        s.sequence,
        s.name,
        s.step_type,
        s.responsibility,
        s.sequence === 1 ? "ACTIVE" : "PENDING",
        s.required,
        s.payment_percentage,
        s.requires_approval,
        s.requires_attachment,
        s.sequence === 1 ? new Date().toISOString() : null,
      ],
    );
  }
  await query(`update vendor_orders set workflow_instance_id = $2 where id = $1`, [
    vendorOrderUuid,
    instId,
  ]);
}

export async function listVendorOrders(): Promise<VendorOrder[]> {
  await ensureManufactureSchema();
  const rows = await query<{ order_number: string }>(
    `select order_number from vendor_orders where organization_id = $1 order by created_at desc`,
    [ORG_ID],
  ).catch(() => [] as { order_number: string }[]);
  const out: VendorOrder[] = [];
  for (const r of rows) {
    const o = await getVendorOrder(r.order_number);
    if (o) out.push(o);
  }
  return out;
}

export async function getVendorOrder(orderNumber: string): Promise<VendorOrder | null> {
  const rows = await query<Record<string, unknown>>(
    `select vo.*, v.code as vendor_code, wt.code as workflow_template_code
     from vendor_orders vo
     join vendors v on v.id = vo.vendor_id
     left join workflow_templates wt on wt.id = vo.workflow_template_id
     where vo.organization_id = $1 and vo.order_number = $2 limit 1`,
    [ORG_ID, orderNumber],
  ).catch(() => [] as Record<string, unknown>[]);
  const r = rows[0];
  if (!r) return null;
  const items = await query<Record<string, unknown>>(
    `select * from vendor_order_items where vendor_order_id = $1 order by line_number`,
    [r.id],
  );
  return {
    id: String(r.order_number),
    orderNumber: String(r.order_number),
    vendorId: String(r.vendor_code),
    orderDate: dateStr(r.order_date as string | Date) ?? "",
    status: r.status as VendorOrder["status"],
    currency: String(r.currency ?? "INR"),
    pricingStatus: r.pricing_status as VendorOrder["pricingStatus"],
    subtotal: num(r.subtotal as string | number | null),
    tax: num(r.tax as string | number | null),
    shipping: num(r.shipping as string | number | null),
    total: num(r.total as string | number | null),
    advancePercentage: num(r.advance_percentage as string | number | null),
    advanceAmount: num(r.advance_amount as string | number | null),
    balanceAmount: num(r.balance_amount as string | number | null),
    requestedDeliveryDate: dateStr(r.requested_delivery_date as string | Date | null),
    vendorCommittedDate: dateStr(r.vendor_committed_date as string | Date | null),
    internalExpectedDate: dateStr(r.internal_expected_date as string | Date | null),
    deliveryLocation: String(r.delivery_location ?? "Studio"),
    notes: String(r.notes ?? ""),
    workflowTemplateId: r.workflow_template_code ? String(r.workflow_template_code) : null,
    workflowInstanceId: r.workflow_instance_id ? String(r.workflow_instance_id) : null,
    items: items.map(
      (i): VendorOrderItem => ({
        id: String(i.id),
        lineNumber: Number(i.line_number),
        productId: String(i.product_code),
        variantId: i.variant_code ? String(i.variant_code) : null,
        title: String(i.title ?? ""),
        variantLabel: String(i.variant_label ?? ""),
        sku: String(i.sku ?? ""),
        quantity: Number(i.quantity),
        unitCost: num(i.unit_cost as string | number | null),
        lineTotal: num(i.line_total as string | number | null),
        material: String(i.material ?? ""),
        colour: String(i.colour ?? ""),
        sizeLabel: String(i.size_label ?? ""),
        customisationInstructions: String(i.customisation_instructions ?? ""),
        finishInstructions: String(i.finish_instructions ?? ""),
        artworkReference: String(i.artwork_reference ?? ""),
        notes: String(i.notes ?? ""),
        productionRequirementId: null,
      }),
    ),
    createdBy: String(r.created_by ?? "founder"),
    createdAt: iso(r.created_at as Date),
    updatedAt: iso(r.updated_at as Date),
  };
}

export async function getWorkflowInstanceForOrder(
  orderNumber: string,
): Promise<WorkflowInstance | null> {
  const order = await query<{ id: string; workflow_instance_id: string | null }>(
    `select id, workflow_instance_id from vendor_orders
     where organization_id = $1 and order_number = $2`,
    [ORG_ID, orderNumber],
  );
  const instId = order[0]?.workflow_instance_id;
  if (!instId) return null;
  const inst = await query<{
    id: string;
    vendor_order_id: string;
    workflow_template_id: string | null;
    status: string;
    current_step_sequence: number | null;
  }>(`select * from workflow_instances where id = $1`, [instId]);
  const i = inst[0];
  if (!i) return null;
  const steps = await query<Record<string, unknown>>(
    `select * from workflow_instance_steps where workflow_instance_id = $1 order by sequence`,
    [instId],
  );
  return {
    id: i.id,
    vendorOrderId: orderNumber,
    workflowTemplateId: null,
    status: i.status as WorkflowInstance["status"],
    currentStepSequence: i.current_step_sequence,
    steps: steps.map(
      (s): WorkflowInstanceStep => ({
        id: String(s.id),
        sequence: Number(s.sequence),
        name: String(s.name),
        stepType: s.step_type as WorkflowInstanceStep["stepType"],
        responsibility: String(s.responsibility),
        status: s.status as WorkflowInstanceStep["status"],
        required: Boolean(s.required),
        paymentPercentage: num(s.payment_percentage as string | number | null),
        requiresApproval: Boolean(s.requires_approval),
        requiresAttachment: Boolean(s.requires_attachment),
        startedAt: s.started_at ? iso(s.started_at as Date) : null,
        dueAt: s.due_at ? iso(s.due_at as Date) : null,
        completedAt: s.completed_at ? iso(s.completed_at as Date) : null,
        notes: String(s.notes ?? ""),
      }),
    ),
  };
}

export async function updateVendorOrderStatus(
  orderNumber: string,
  status: VendorOrder["status"],
): Promise<void> {
  await query(
    `update vendor_orders set status = $3, updated_at = now()
     where organization_id = $1 and order_number = $2`,
    [ORG_ID, orderNumber, status],
  );
}

export async function completeActiveWorkflowStep(
  orderNumber: string,
  notes?: string,
): Promise<WorkflowInstance | null> {
  const inst = await getWorkflowInstanceForOrder(orderNumber);
  if (!inst) return null;
  const active = inst.steps.find((s) => s.status === "ACTIVE" || s.status === "AWAITING_VENDOR" || s.status === "AWAITING_AARLA");
  if (!active) return inst;
  await query(
    `update workflow_instance_steps set status = 'COMPLETED', completed_at = now(), notes = coalesce($2, notes)
     where id = $1`,
    [active.id, notes ?? null],
  );
  const next = inst.steps.find((s) => s.sequence === active.sequence + 1);
  if (next) {
    const nextStatus =
      next.stepType === "AWAIT_CONFIRMATION" || next.responsibility === "vendor"
        ? "AWAITING_VENDOR"
        : "ACTIVE";
    await query(
      `update workflow_instance_steps set status = $2, started_at = now() where id = $1`,
      [next.id, nextStatus],
    );
    await query(
      `update workflow_instances set current_step_sequence = $2, updated_at = now() where id = $1`,
      [inst.id, next.sequence],
    );
  } else {
    await query(
      `update workflow_instances set status = 'completed', updated_at = now() where id = $1`,
      [inst.id],
    );
  }
  return getWorkflowInstanceForOrder(orderNumber);
}

export async function listProductionRequirements(): Promise<ProductionRequirement[]> {
  await ensureManufactureSchema();
  const rows = await query<Record<string, unknown>>(
    `select pr.*, v.code as suggested_vendor_code
     from production_requirements pr
     left join vendors v on v.id = pr.suggested_vendor_id
     where pr.organization_id = $1
     order by
       case pr.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
       pr.created_at desc`,
    [ORG_ID],
  ).catch(() => [] as Record<string, unknown>[]);
  return rows.map((r) => ({
    id: String(r.code),
    code: String(r.code),
    sourceType: r.source_type as ProductionRequirement["sourceType"],
    sourceId: r.source_id ? String(r.source_id) : null,
    productId: String(r.product_code),
    variantId: r.variant_code ? String(r.variant_code) : null,
    quantityRequired: Number(r.quantity_required),
    quantityAlreadyAvailable: Number(r.quantity_already_available ?? 0),
    quantityToProduce: Number(r.quantity_to_produce),
    requiredByDate: dateStr(r.required_by_date as string | Date | null),
    priority: r.priority as ProductionRequirement["priority"],
    reason: String(r.reason ?? ""),
    status: r.status as ProductionRequirement["status"],
    suggestedVendorId: r.suggested_vendor_code ? String(r.suggested_vendor_code) : null,
    transferSuggestion: (r.transfer_suggestion as ProductionRequirement["transferSuggestion"]) ?? null,
    vendorOrderId: null,
    createdAt: iso(r.created_at as Date),
  }));
}

export async function upsertManualProductionRequirement(input: {
  productCode: string;
  variantCode?: string | null;
  quantityToProduce: number;
  reason: string;
  suggestedVendorCode?: string | null;
  priority?: ProductionRequirement["priority"];
}): Promise<ProductionRequirement> {
  await ensureManufactureSchema();
  const code = `need-${Date.now().toString(36)}`;
  const vendorId = input.suggestedVendorCode
    ? await vendorUuid(input.suggestedVendorCode)
    : null;
  await query(
    `insert into production_requirements (
       organization_id, code, source_type, product_code, variant_code,
       quantity_required, quantity_already_available, quantity_to_produce,
       priority, reason, status, suggested_vendor_id
     ) values ($1,$2,'MANUAL',$3,$4,$5,0,$5,$6,$7,'open',$8)`,
    [
      ORG_ID,
      code,
      input.productCode,
      input.variantCode ?? null,
      input.quantityToProduce,
      input.priority ?? "normal",
      input.reason,
      vendorId,
    ],
  );
  const list = await listProductionRequirements();
  const found = list.find((r) => r.code === code);
  if (!found) throw new Error("Failed to create requirement");
  return found;
}

export async function updateProductionRequirementStatus(
  code: string,
  status: ProductionRequirement["status"],
): Promise<void> {
  await query(
    `update production_requirements set status = $3, updated_at = now()
     where organization_id = $1 and code = $2`,
    [ORG_ID, code, status],
  );
}

export async function listVendorPayments(orderNumber: string): Promise<VendorPayment[]> {
  const order = await query<{ id: string }>(
    `select id from vendor_orders where organization_id = $1 and order_number = $2`,
    [ORG_ID, orderNumber],
  );
  if (!order[0]) return [];
  const rows = await query<Record<string, unknown>>(
    `select * from vendor_payments where vendor_order_id = $1 order by created_at`,
    [order[0].id],
  );
  return rows.map((r) => ({
    id: String(r.id),
    vendorOrderId: orderNumber,
    stage: r.stage as VendorPayment["stage"],
    amount: Number(r.amount),
    percentage: num(r.percentage as string | number | null),
    dueWhen: String(r.due_when ?? ""),
    dueDate: dateStr(r.due_date as string | Date | null),
    paidAt: r.paid_at ? iso(r.paid_at as Date) : null,
    paymentMethod: String(r.payment_method ?? ""),
    reference: String(r.reference ?? ""),
    status: r.status as VendorPayment["status"],
  }));
}

export async function markPaymentPaid(
  paymentId: string,
  reference?: string,
): Promise<void> {
  await query(
    `update vendor_payments set status = 'paid', paid_at = now(), reference = coalesce($2, reference), updated_at = now()
     where id = $1`,
    [paymentId, reference ?? null],
  );
}

export async function recordVendorConfirmation(input: {
  orderNumber: string;
  confirmed: boolean;
  committedDeliveryDate?: string | null;
  confirmedPrice?: number | null;
  vendorNotes?: string;
}): Promise<void> {
  const order = await query<{
    id: string;
    requested_delivery_date: Date | string | null;
    total: string | number | null;
  }>(
    `select id, requested_delivery_date, total from vendor_orders
     where organization_id = $1 and order_number = $2`,
    [ORG_ID, input.orderNumber],
  );
  if (!order[0]) throw new Error("Order not found");
  await query(
    `insert into vendor_confirmations (
       vendor_order_id, confirmed, committed_delivery_date, confirmed_price, vendor_notes,
       original_requested_delivery_date, original_total
     ) values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      order[0].id,
      input.confirmed,
      input.committedDeliveryDate ?? null,
      input.confirmedPrice ?? null,
      input.vendorNotes ?? "",
      order[0].requested_delivery_date,
      order[0].total,
    ],
  );
  if (input.confirmed) {
    await query(
      `update vendor_orders set
         status = 'confirmed',
         vendor_committed_date = coalesce($3, vendor_committed_date),
         total = coalesce($4, total),
         pricing_status = case when $4 is not null then 'confirmed' else pricing_status end,
         updated_at = now()
       where id = $1 and organization_id = $2`,
      [order[0].id, ORG_ID, input.committedDeliveryDate ?? null, input.confirmedPrice ?? null],
    );
    await completeActiveWorkflowStep(input.orderNumber, "Vendor confirmation recorded");
  }
}

export async function savePdfVersion(input: {
  orderNumber: string;
  bytes: Buffer;
  snapshot: unknown;
  generatedBy?: string;
}): Promise<VendorOrderPdfVersion> {
  const order = await query<{ id: string }>(
    `select id from vendor_orders where organization_id = $1 and order_number = $2`,
    [ORG_ID, input.orderNumber],
  );
  if (!order[0]) throw new Error("Order not found");
  const max = await query<{ m: number }>(
    `select coalesce(max(version_number),0)::int as m from vendor_order_pdf_versions where vendor_order_id = $1`,
    [order[0].id],
  );
  const version = (max[0]?.m ?? 0) + 1;
  const rows = await query<{ id: string; generated_at: Date }>(
    `insert into vendor_order_pdf_versions (
       vendor_order_id, version_number, generated_by, order_snapshot, file_bytes
     ) values ($1,$2,$3,$4::jsonb,$5) returning id, generated_at`,
    [
      order[0].id,
      version,
      input.generatedBy ?? "founder",
      JSON.stringify(input.snapshot),
      input.bytes,
    ],
  );
  return {
    id: rows[0]!.id,
    vendorOrderId: input.orderNumber,
    versionNumber: version,
    generatedAt: iso(rows[0]!.generated_at),
    generatedBy: input.generatedBy ?? "founder",
    sentAt: null,
    hasFile: true,
  };
}

export async function getLatestPdfVersion(
  orderNumber: string,
): Promise<(VendorOrderPdfVersion & { bytes?: Buffer }) | null> {
  const order = await query<{ id: string }>(
    `select id from vendor_orders where organization_id = $1 and order_number = $2`,
    [ORG_ID, orderNumber],
  );
  if (!order[0]) return null;
  const rows = await query<{
    id: string;
    version_number: number;
    generated_at: Date;
    generated_by: string;
    sent_at: Date | null;
    file_bytes: Buffer | null;
  }>(
    `select id, version_number, generated_at, generated_by, sent_at, file_bytes
     from vendor_order_pdf_versions where vendor_order_id = $1
     order by version_number desc limit 1`,
    [order[0].id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    vendorOrderId: orderNumber,
    versionNumber: r.version_number,
    generatedAt: iso(r.generated_at),
    generatedBy: r.generated_by,
    sentAt: r.sent_at ? iso(r.sent_at) : null,
    hasFile: Boolean(r.file_bytes),
    bytes: r.file_bytes ?? undefined,
  };
}

export async function logCommunication(input: {
  orderNumber: string;
  channel: VendorOrderCommunication["channel"];
  direction: "OUTBOUND" | "INBOUND";
  status: VendorOrderCommunication["status"];
  recipient: string;
  message: string;
  pdfVersionId?: string | null;
}): Promise<VendorOrderCommunication> {
  const order = await query<{ id: string }>(
    `select id from vendor_orders where organization_id = $1 and order_number = $2`,
    [ORG_ID, input.orderNumber],
  );
  if (!order[0]) throw new Error("Order not found");
  const rows = await query<{ id: string; created_at: Date }>(
    `insert into vendor_order_communications (
       vendor_order_id, channel, direction, status, recipient, sender, message, pdf_version_id
     ) values ($1,$2,$3,$4,$5,'aarla',$6,$7) returning id, created_at`,
    [
      order[0].id,
      input.channel,
      input.direction,
      input.status,
      input.recipient,
      input.message,
      input.pdfVersionId ?? null,
    ],
  );
  if (input.status === "SENT" && input.pdfVersionId) {
    await query(`update vendor_order_pdf_versions set sent_at = now() where id = $1`, [
      input.pdfVersionId,
    ]);
  }
  return {
    id: rows[0]!.id,
    vendorOrderId: input.orderNumber,
    channel: input.channel,
    direction: input.direction,
    status: input.status,
    recipient: input.recipient,
    sender: "aarla",
    message: input.message,
    pdfVersionId: input.pdfVersionId ?? null,
    createdAt: iso(rows[0]!.created_at),
  };
}

export async function listCommunications(
  orderNumber: string,
): Promise<VendorOrderCommunication[]> {
  const order = await query<{ id: string }>(
    `select id from vendor_orders where organization_id = $1 and order_number = $2`,
    [ORG_ID, orderNumber],
  );
  if (!order[0]) return [];
  const rows = await query<Record<string, unknown>>(
    `select * from vendor_order_communications where vendor_order_id = $1 order by created_at desc`,
    [order[0].id],
  );
  return rows.map((r) => ({
    id: String(r.id),
    vendorOrderId: orderNumber,
    channel: r.channel as VendorOrderCommunication["channel"],
    direction: r.direction as VendorOrderCommunication["direction"],
    status: r.status as VendorOrderCommunication["status"],
    recipient: String(r.recipient ?? ""),
    sender: String(r.sender ?? ""),
    message: String(r.message ?? ""),
    pdfVersionId: r.pdf_version_id ? String(r.pdf_version_id) : null,
    createdAt: iso(r.created_at as Date),
  }));
}

/** Bridge multi-line vendor orders into legacy single-line POs for Receive Stock ledger. */
export async function syncVendorOrderToLegacyPurchaseOrders(
  orderNumber: string,
): Promise<string[]> {
  const order = await getVendorOrder(orderNumber);
  if (!order) throw new Error("Order not found");
  const { createManufacturingPO } = await import("@/lib/application/services");
  const ids: string[] = [];
  for (const item of order.items) {
    const poId =
      order.items.length === 1
        ? orderNumber
        : `${orderNumber}-L${item.lineNumber}`;
    await createManufacturingPO({
      id: poId,
      vendorId: order.vendorId,
      productId: item.productId,
      quantity: item.quantity,
      unitCost: item.unitCost ?? 0,
      requiredDate:
        order.vendorCommittedDate ??
        order.requestedDeliveryDate ??
        order.internalExpectedDate ??
        order.orderDate,
    });
    ids.push(poId);
  }
  await updateVendorOrderStatus(orderNumber, "ready_to_receive");
  return ids;
}

void productUuid;
