import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import type {
  Campaign,
  CampaignAllocation,
  CampaignLineItem,
  CampaignPartnerRecall,
  CampaignPartnerRecallStatus,
  CampaignStatus,
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/lib/domain/campaign-types";
import type {
  CampaignAttributedSalesRow,
  CampaignRepository,
  InsertCampaignAllocationInput,
  InsertCampaignLineItemInput,
  UpsertCampaignPartnerRecallInput,
} from "@/lib/repositories/campaigns";

type Q = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function isoDate(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(String(value));
  return d.toISOString().slice(0, 10);
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapCampaign(r: {
  id: string;
  code: string;
  name: string;
  start_date: string | Date;
  end_date: string | Date;
  daily_ad_budget: string | number;
  planned_ad_spend: string | number;
  target_revenue: string | number | null;
  target_orders: number | null;
  target_aov: string | number | null;
  status: string;
  notes: string;
  created_at: string | Date;
  updated_at: string | Date;
}): Campaign {
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    startDate: isoDate(r.start_date),
    endDate: isoDate(r.end_date),
    dailyAdBudget: num(r.daily_ad_budget),
    plannedAdSpend: num(r.planned_ad_spend),
    targetRevenue: numOrNull(r.target_revenue),
    targetOrders: r.target_orders == null ? null : num(r.target_orders),
    targetAov: numOrNull(r.target_aov),
    status: r.status as CampaignStatus,
    notes: String(r.notes ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function mapLineItem(r: {
  id: string;
  campaign_id: string;
  product_code: string;
  variant_code: string | null;
  planned_quantity: number | string;
  unit_cost: string | number;
  selling_price: string | number;
  notes: string;
  created_at: string | Date;
  updated_at: string | Date;
}): CampaignLineItem {
  return {
    id: String(r.id),
    campaignId: String(r.campaign_id),
    productCode: String(r.product_code),
    variantCode: r.variant_code ? String(r.variant_code) : null,
    plannedQuantity: num(r.planned_quantity),
    unitCost: num(r.unit_cost),
    sellingPrice: num(r.selling_price),
    notes: String(r.notes ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function mapAllocation(r: {
  id: string;
  campaign_id: string;
  product_code: string;
  variant_code: string | null;
  quantity: number | string;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}): CampaignAllocation {
  return {
    id: String(r.id),
    campaignId: String(r.campaign_id),
    productCode: String(r.product_code),
    variantCode: r.variant_code ? String(r.variant_code) : null,
    quantity: num(r.quantity),
    status: r.status as CampaignAllocation["status"],
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function mapPartnerRecall(r: {
  id: string;
  campaign_id: string;
  partner_code: string;
  product_code: string;
  variant_code: string | null;
  quantity: number | string;
  status: string;
  notes: string;
  created_at: string | Date;
  updated_at: string | Date;
}): CampaignPartnerRecall {
  return {
    id: String(r.id),
    campaignId: String(r.campaign_id),
    partnerCode: String(r.partner_code),
    productCode: String(r.product_code),
    variantCode: r.variant_code ? String(r.variant_code) : null,
    quantity: num(r.quantity),
    status: r.status as CampaignPartnerRecallStatus,
    notes: String(r.notes ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const CAMPAIGN_COLS = `
  id, code, name, start_date, end_date, daily_ad_budget, planned_ad_spend,
  target_revenue, target_orders, target_aov, status, notes, created_at, updated_at
`;

const LINE_COLS = `
  id, campaign_id, product_code, variant_code, planned_quantity,
  unit_cost, selling_price, notes, created_at, updated_at
`;

const ALLOC_COLS = `
  id, campaign_id, product_code, variant_code, quantity, status, created_at, updated_at
`;

const RECALL_COLS = `
  id, campaign_id, partner_code, product_code, variant_code, quantity,
  status, notes, created_at, updated_at
`;

export function createCampaignRepository(): CampaignRepository {
  const q: Q = poolQuery;

  return {
    async listCampaigns() {
      const rows = await q<Parameters<typeof mapCampaign>[0]>(
        `select ${CAMPAIGN_COLS}
         from campaigns
         where organization_id = $1
         order by start_date desc, created_at desc`,
        [ORG_ID],
      );
      return rows.map(mapCampaign);
    },

    async getCampaign(id) {
      const rows = await q<Parameters<typeof mapCampaign>[0]>(
        `select ${CAMPAIGN_COLS}
         from campaigns
         where organization_id = $1 and id = $2
         limit 1`,
        [ORG_ID, id],
      );
      return rows[0] ? mapCampaign(rows[0]) : null;
    },

    async createCampaign(input: CreateCampaignInput & { code: string }) {
      const rows = await q<Parameters<typeof mapCampaign>[0]>(
        `insert into campaigns (
           organization_id, code, name, start_date, end_date,
           daily_ad_budget, planned_ad_spend, target_revenue, target_orders,
           target_aov, notes
         ) values ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,$11)
         returning ${CAMPAIGN_COLS}`,
        [
          ORG_ID,
          input.code,
          input.name.trim(),
          input.startDate,
          input.endDate,
          input.dailyAdBudget ?? 0,
          input.plannedAdSpend ?? 0,
          input.targetRevenue ?? null,
          input.targetOrders ?? null,
          input.targetAov ?? null,
          input.notes ?? "",
        ],
      );
      return mapCampaign(rows[0]!);
    },

    async updateCampaign(id, input: UpdateCampaignInput) {
      const rows = await q<Parameters<typeof mapCampaign>[0]>(
        `update campaigns set
           name = coalesce($3, name),
           start_date = coalesce($4::date, start_date),
           end_date = coalesce($5::date, end_date),
           daily_ad_budget = coalesce($6, daily_ad_budget),
           planned_ad_spend = coalesce($7, planned_ad_spend),
           target_revenue = case when $8::boolean then $9 else target_revenue end,
           target_orders = case when $10::boolean then $11 else target_orders end,
           target_aov = case when $12::boolean then $13 else target_aov end,
           notes = coalesce($14, notes)
         where organization_id = $1 and id = $2
         returning ${CAMPAIGN_COLS}`,
        [
          ORG_ID,
          id,
          input.name?.trim() ?? null,
          input.startDate ?? null,
          input.endDate ?? null,
          input.dailyAdBudget ?? null,
          input.plannedAdSpend ?? null,
          input.targetRevenue !== undefined,
          input.targetRevenue ?? null,
          input.targetOrders !== undefined,
          input.targetOrders ?? null,
          input.targetAov !== undefined,
          input.targetAov ?? null,
          input.notes ?? null,
        ],
      );
      if (!rows[0]) throw new Error("Campaign not found.");
      return mapCampaign(rows[0]);
    },

    async setStatus(id, status) {
      const rows = await q<Parameters<typeof mapCampaign>[0]>(
        `update campaigns set status = $3
         where organization_id = $1 and id = $2
         returning ${CAMPAIGN_COLS}`,
        [ORG_ID, id, status],
      );
      if (!rows[0]) throw new Error("Campaign not found.");
      return mapCampaign(rows[0]);
    },

    async listLineItems(campaignId) {
      const rows = await q<Parameters<typeof mapLineItem>[0]>(
        `select ${LINE_COLS}
         from campaign_line_items
         where organization_id = $1 and campaign_id = $2
         order by product_code, coalesce(variant_code, '')`,
        [ORG_ID, campaignId],
      );
      return rows.map(mapLineItem);
    },

    async upsertLineItem(input: InsertCampaignLineItemInput) {
      const existing = await q<Parameters<typeof mapLineItem>[0]>(
        input.variantCode == null
          ? `select ${LINE_COLS} from campaign_line_items
             where organization_id = $1 and campaign_id = $2
               and product_code = $3 and variant_code is null
             limit 1`
          : `select ${LINE_COLS} from campaign_line_items
             where organization_id = $1 and campaign_id = $2
               and product_code = $3 and variant_code = $4
             limit 1`,
        input.variantCode == null
          ? [ORG_ID, input.campaignId, input.productCode]
          : [ORG_ID, input.campaignId, input.productCode, input.variantCode],
      );
      if (existing[0]) {
        const rows = await q<Parameters<typeof mapLineItem>[0]>(
          `update campaign_line_items set
             planned_quantity = $2, unit_cost = $3, selling_price = $4, notes = $5
           where id = $1
           returning ${LINE_COLS}`,
          [
            existing[0].id,
            input.plannedQuantity,
            input.unitCost,
            input.sellingPrice,
            input.notes,
          ],
        );
        return mapLineItem(rows[0]!);
      }
      const rows = await q<Parameters<typeof mapLineItem>[0]>(
        `insert into campaign_line_items (
           organization_id, campaign_id, product_code, variant_code,
           planned_quantity, unit_cost, selling_price, notes
         ) values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning ${LINE_COLS}`,
        [
          ORG_ID,
          input.campaignId,
          input.productCode,
          input.variantCode,
          input.plannedQuantity,
          input.unitCost,
          input.sellingPrice,
          input.notes,
        ],
      );
      return mapLineItem(rows[0]!);
    },

    async updateLinePlannedQuantity(campaignId, productCode, variantCode, plannedQuantity) {
      const rows = await q<Parameters<typeof mapLineItem>[0]>(
        variantCode == null
          ? `update campaign_line_items set planned_quantity = $4
             where organization_id = $1 and campaign_id = $2
               and product_code = $3 and variant_code is null
             returning ${LINE_COLS}`
          : `update campaign_line_items set planned_quantity = $5
             where organization_id = $1 and campaign_id = $2
               and product_code = $3 and variant_code = $4
             returning ${LINE_COLS}`,
        variantCode == null
          ? [ORG_ID, campaignId, productCode, plannedQuantity]
          : [ORG_ID, campaignId, productCode, variantCode, plannedQuantity],
      );
      return rows[0] ? mapLineItem(rows[0]) : null;
    },

    async listActiveAllocations(campaignId) {
      const rows = await q<Parameters<typeof mapAllocation>[0]>(
        `select ${ALLOC_COLS}
         from campaign_allocations
         where organization_id = $1 and campaign_id = $2 and status = 'active'
         order by product_code, coalesce(variant_code, '')`,
        [ORG_ID, campaignId],
      );
      return rows.map(mapAllocation);
    },

    async getActiveAllocation(campaignId, productCode, variantCode) {
      const rows = await q<Parameters<typeof mapAllocation>[0]>(
        variantCode == null
          ? `select ${ALLOC_COLS}
             from campaign_allocations
             where organization_id = $1 and campaign_id = $2
               and product_code = $3 and variant_code is null and status = 'active'
             limit 1`
          : `select ${ALLOC_COLS}
             from campaign_allocations
             where organization_id = $1 and campaign_id = $2
               and product_code = $3 and variant_code = $4 and status = 'active'
             limit 1`,
        variantCode == null
          ? [ORG_ID, campaignId, productCode]
          : [ORG_ID, campaignId, productCode, variantCode],
      );
      return rows[0] ? mapAllocation(rows[0]) : null;
    },

    async upsertActiveAllocation(input: InsertCampaignAllocationInput) {
      const existing = await this.getActiveAllocation(
        input.campaignId,
        input.productCode,
        input.variantCode,
      );
      if (existing) {
        const rows = await q<Parameters<typeof mapAllocation>[0]>(
          `update campaign_allocations set quantity = $2
           where id = $1 and status = 'active'
           returning ${ALLOC_COLS}`,
          [existing.id, input.quantity],
        );
        return mapAllocation(rows[0]!);
      }
      const rows = await q<Parameters<typeof mapAllocation>[0]>(
        `insert into campaign_allocations (
           organization_id, campaign_id, product_code, variant_code, quantity, status
         ) values ($1,$2,$3,$4,$5,'active')
         returning ${ALLOC_COLS}`,
        [
          ORG_ID,
          input.campaignId,
          input.productCode,
          input.variantCode,
          input.quantity,
        ],
      );
      return mapAllocation(rows[0]!);
    },

    async releaseAllocation(allocationId) {
      const rows = await q<Parameters<typeof mapAllocation>[0]>(
        `update campaign_allocations set status = 'released'
         where organization_id = $1 and id = $2 and status = 'active'
         returning ${ALLOC_COLS}`,
        [ORG_ID, allocationId],
      );
      return rows[0] ? mapAllocation(rows[0]) : null;
    },

    async reduceActiveAllocation(allocationId, newQuantity) {
      if (newQuantity <= 0) {
        return this.releaseAllocation(allocationId);
      }
      const rows = await q<Parameters<typeof mapAllocation>[0]>(
        `update campaign_allocations set quantity = $3
         where organization_id = $1 and id = $2 and status = 'active'
         returning ${ALLOC_COLS}`,
        [ORG_ID, allocationId, newQuantity],
      );
      return rows[0] ? mapAllocation(rows[0]) : null;
    },

    async listRecallsForCampaign(campaignId) {
      const rows = await q<Parameters<typeof mapPartnerRecall>[0]>(
        `select ${RECALL_COLS}
         from campaign_partner_recalls
         where organization_id = $1 and campaign_id = $2
         order by partner_code, product_code, coalesce(variant_code, '')`,
        [ORG_ID, campaignId],
      );
      return rows.map(mapPartnerRecall);
    },

    async upsertPartnerRecall(input: UpsertCampaignPartnerRecallInput) {
      const existing = await q<Parameters<typeof mapPartnerRecall>[0]>(
        input.variantCode == null
          ? `select ${RECALL_COLS} from campaign_partner_recalls
             where organization_id = $1 and campaign_id = $2
               and partner_code = $3 and product_code = $4 and variant_code is null
             limit 1`
          : `select ${RECALL_COLS} from campaign_partner_recalls
             where organization_id = $1 and campaign_id = $2
               and partner_code = $3 and product_code = $4 and variant_code = $5
             limit 1`,
        input.variantCode == null
          ? [ORG_ID, input.campaignId, input.partnerCode, input.productCode]
          : [
              ORG_ID,
              input.campaignId,
              input.partnerCode,
              input.productCode,
              input.variantCode,
            ],
      );
      if (existing[0]) {
        const rows = await q<Parameters<typeof mapPartnerRecall>[0]>(
          `update campaign_partner_recalls set
             quantity = $2, status = $3, notes = $4
           where id = $1
           returning ${RECALL_COLS}`,
          [existing[0].id, input.quantity, input.status, input.notes],
        );
        return mapPartnerRecall(rows[0]!);
      }
      const rows = await q<Parameters<typeof mapPartnerRecall>[0]>(
        `insert into campaign_partner_recalls (
           organization_id, campaign_id, partner_code, product_code, variant_code,
           quantity, status, notes
         ) values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning ${RECALL_COLS}`,
        [
          ORG_ID,
          input.campaignId,
          input.partnerCode,
          input.productCode,
          input.variantCode,
          input.quantity,
          input.status,
          input.notes,
        ],
      );
      return mapPartnerRecall(rows[0]!);
    },

    async deletePartnerRecall(campaignId, partnerCode, productCode, variantCode) {
      const rows = await q<{ id: string }>(
        variantCode == null
          ? `delete from campaign_partner_recalls
             where organization_id = $1 and campaign_id = $2
               and partner_code = $3 and product_code = $4 and variant_code is null
             returning id`
          : `delete from campaign_partner_recalls
             where organization_id = $1 and campaign_id = $2
               and partner_code = $3 and product_code = $4 and variant_code = $5
             returning id`,
        variantCode == null
          ? [ORG_ID, campaignId, partnerCode, productCode]
          : [ORG_ID, campaignId, partnerCode, productCode, variantCode],
      );
      return rows.length > 0;
    },

    async sumActiveCampaignHolds(productCode, variantCode) {
      const rows = await q<{ total: string | number }>(
        variantCode == null
          ? `select coalesce(sum(quantity), 0)::int as total
             from campaign_allocations
             where organization_id = $1
               and status = 'active'
               and product_code = $2`
          : `select coalesce(sum(quantity), 0)::int as total
             from campaign_allocations
             where organization_id = $1
               and status = 'active'
               and product_code = $2
               and (variant_code = $3 or variant_code is null)`,
        variantCode == null ? [ORG_ID, productCode] : [ORG_ID, productCode, variantCode],
      );
      return num(rows[0]?.total);
    },

    async sumAttributedShopifySales(input): Promise<CampaignAttributedSalesRow> {
      if (!input.productCodes.length && !input.skus.length) {
        return { revenue: 0, units: 0, orderCount: 0 };
      }
      // Weak attribution: match line title/variant_title against catalog SKUs or product titles
      // via products joined on code. Partner sales live in stock_movements — not included.
      const rows = await q<{
        revenue: string | number;
        units: string | number;
        order_count: string | number;
      }>(
        `select
           coalesce(sum(i.quantity * i.unit_price), 0) as revenue,
           coalesce(sum(i.quantity), 0)::int as units,
           coalesce(count(distinct o.id), 0)::int as order_count
         from external_orders o
         join external_order_items i on i.external_order_id = o.id
         where o.organization_id = $1
           and o.is_valid = true
           and o.order_date >= $2::date
           and o.order_date < ($3::date + interval '1 day')
           and exists (
             select 1
             from products p
             left join product_variants pv
               on pv.product_id = p.id and pv.organization_id = p.organization_id
             where p.organization_id = o.organization_id
               and (
                 p.code = any($4::text[])
                 or p.sku = any($5::text[])
                 or pv.sku = any($5::text[])
               )
               and (
                 i.title ilike '%' || p.sku || '%'
                 or i.title ilike '%' || p.title || '%'
                 or (pv.sku is not null and (
                   i.title ilike '%' || pv.sku || '%'
                   or coalesce(i.variant_title, '') ilike '%' || pv.sku || '%'
                 ))
                 or (pv.code is not null and coalesce(i.variant_title, '') ilike '%' || pv.label || '%')
               )
           )`,
        [ORG_ID, input.startDate, input.endDate, input.productCodes, input.skus],
      );
      const r = rows[0];
      return {
        revenue: num(r?.revenue),
        units: num(r?.units),
        orderCount: num(r?.order_count),
      };
    },
  };
}
