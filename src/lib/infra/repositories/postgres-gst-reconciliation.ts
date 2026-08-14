import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import type {
  GstAccountantPackMeta,
  GstPeriodStatus,
  GstSalesRow,
  OrganizationAccountantSettings,
  PurchaseBill,
  UpsertPurchaseBillInput,
} from "@/lib/domain/gst-types";
import type {
  GstDuplicateCandidate,
  GstEvidenceInsert,
  GstEvidenceRow,
  GstLastSendRow,
  GstPackInsert,
  GstPackRow,
  GstPeriodRow,
  GstReconciliationRepository,
  GstSendInsert,
  UpsertAccountantSettingsInput,
} from "@/lib/repositories/gst-reconciliation";

type Q = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function isoDateOrNull(value: unknown): string | null {
  if (value == null) return null;
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

function mapSettings(r: {
  organization_id: string;
  legal_name: string;
  gstin: string;
  state: string;
  accountant_name: string;
  accountant_email: string;
  financial_year_start_month: number;
  updated_at: string | Date | null;
}): OrganizationAccountantSettings {
  return {
    organizationId: String(r.organization_id),
    legalName: String(r.legal_name ?? ""),
    gstin: String(r.gstin ?? ""),
    state: String(r.state ?? ""),
    accountantName: String(r.accountant_name ?? ""),
    accountantEmail: String(r.accountant_email ?? ""),
    financialYearStartMonth: num(r.financial_year_start_month) || 4,
    updatedAt: r.updated_at ? iso(r.updated_at) : null,
  };
}

function mapPeriod(r: {
  id: string;
  financial_year: string;
  month: number;
  status: string;
  exception_count: number;
  notes: string;
  created_at: string | Date;
  updated_at: string | Date;
}): GstPeriodRow {
  return {
    id: String(r.id),
    financialYear: String(r.financial_year),
    month: num(r.month),
    status: r.status as GstPeriodStatus,
    exceptionCount: num(r.exception_count),
    notes: String(r.notes ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function mapBill(r: {
  id: string;
  vendor_id: string | null;
  vendor_name: string;
  vendor_gstin: string | null;
  invoice_number: string;
  invoice_date: string | Date | null;
  taxable_value: string | number;
  cgst: string | number;
  sgst: string | number;
  igst: string | number;
  cess: string | number | null;
  total_tax: string | number;
  invoice_total: string | number;
  source: string;
  source_evidence_id: string | null;
  attachment_reference: string | null;
  notes: string;
  review_status: string;
  created_at: string | Date;
  updated_at: string | Date;
}): PurchaseBill {
  return {
    id: String(r.id),
    vendorId: r.vendor_id ? String(r.vendor_id) : null,
    vendorName: String(r.vendor_name ?? ""),
    vendorGstin: r.vendor_gstin ? String(r.vendor_gstin) : null,
    invoiceNumber: String(r.invoice_number ?? ""),
    invoiceDate: isoDateOrNull(r.invoice_date),
    taxableValue: num(r.taxable_value),
    cgst: num(r.cgst),
    sgst: num(r.sgst),
    igst: num(r.igst),
    cess: numOrNull(r.cess),
    totalTax: num(r.total_tax),
    invoiceTotal: num(r.invoice_total),
    source: r.source as PurchaseBill["source"],
    sourceEvidenceId: r.source_evidence_id ? String(r.source_evidence_id) : null,
    attachmentReference: r.attachment_reference ? String(r.attachment_reference) : null,
    notes: String(r.notes ?? ""),
    reviewStatus: r.review_status as PurchaseBill["reviewStatus"],
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function salesTaxComplete(row: {
  taxable_amount: string | number | null;
  cgst: string | number | null;
  sgst: string | number | null;
  igst: string | number | null;
}): boolean {
  const taxable = numOrNull(row.taxable_amount);
  if (taxable == null) return false;
  const cgst = numOrNull(row.cgst);
  const sgst = numOrNull(row.sgst);
  const igst = numOrNull(row.igst);
  // At least one GST component captured (zeros count as captured).
  if (cgst == null && sgst == null && igst == null) return false;
  return true;
}

export function createGstReconciliationRepository(): GstReconciliationRepository {
  const q: Q = poolQuery;

  return {
    async getAccountantSettings() {
      const rows = await q<{
        organization_id: string;
        legal_name: string;
        gstin: string;
        state: string;
        accountant_name: string;
        accountant_email: string;
        financial_year_start_month: number;
        updated_at: string | Date | null;
      }>(
        `insert into organization_accountant_settings (organization_id)
         values ($1)
         on conflict (organization_id) do update
           set organization_id = excluded.organization_id
         returning organization_id, legal_name, gstin, state,
                   accountant_name, accountant_email,
                   financial_year_start_month, updated_at`,
        [ORG_ID],
      );
      return mapSettings(rows[0]!);
    },

    async upsertAccountantSettings(input: UpsertAccountantSettingsInput) {
      const fyStart = input.financialYearStartMonth ?? 4;
      const rows = await q<{
        organization_id: string;
        legal_name: string;
        gstin: string;
        state: string;
        accountant_name: string;
        accountant_email: string;
        financial_year_start_month: number;
        updated_at: string | Date | null;
      }>(
        `insert into organization_accountant_settings (
           organization_id, legal_name, gstin, state,
           accountant_name, accountant_email, financial_year_start_month, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7, now())
         on conflict (organization_id) do update set
           legal_name = excluded.legal_name,
           gstin = excluded.gstin,
           state = excluded.state,
           accountant_name = excluded.accountant_name,
           accountant_email = excluded.accountant_email,
           financial_year_start_month = excluded.financial_year_start_month,
           updated_at = now()
         returning organization_id, legal_name, gstin, state,
                   accountant_name, accountant_email,
                   financial_year_start_month, updated_at`,
        [
          ORG_ID,
          input.legalName,
          input.gstin,
          input.state,
          input.accountantName,
          input.accountantEmail,
          fyStart,
        ],
      );
      return mapSettings(rows[0]!);
    },

    async getOrCreatePeriod(financialYear, month) {
      const rows = await q<{
        id: string;
        financial_year: string;
        month: number;
        status: string;
        exception_count: number;
        notes: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `insert into gst_reconciliation_periods (
           organization_id, financial_year, month
         ) values ($1, $2, $3)
         on conflict (organization_id, financial_year, month) do update
           set financial_year = excluded.financial_year
         returning id, financial_year, month, status, exception_count,
                   notes, created_at, updated_at`,
        [ORG_ID, financialYear, month],
      );
      return mapPeriod(rows[0]!);
    },

    async updatePeriodStatus(periodId, status, exceptionCount) {
      const rows = await q<{
        id: string;
        financial_year: string;
        month: number;
        status: string;
        exception_count: number;
        notes: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        exceptionCount == null
          ? `update gst_reconciliation_periods
             set status = $3
             where id = $1 and organization_id = $2
             returning id, financial_year, month, status, exception_count,
                       notes, created_at, updated_at`
          : `update gst_reconciliation_periods
             set status = $3, exception_count = $4
             where id = $1 and organization_id = $2
             returning id, financial_year, month, status, exception_count,
                       notes, created_at, updated_at`,
        exceptionCount == null
          ? [periodId, ORG_ID, status]
          : [periodId, ORG_ID, status, exceptionCount],
      );
      if (!rows[0]) throw new Error("GST period not found.");
      return mapPeriod(rows[0]);
    },

    async listPurchaseBillsInRange(startDateInclusive, endDateExclusive) {
      const rows = await q<{
        id: string;
        vendor_id: string | null;
        vendor_name: string;
        vendor_gstin: string | null;
        invoice_number: string;
        invoice_date: string | Date | null;
        taxable_value: string | number;
        cgst: string | number;
        sgst: string | number;
        igst: string | number;
        cess: string | number | null;
        total_tax: string | number;
        invoice_total: string | number;
        source: string;
        source_evidence_id: string | null;
        attachment_reference: string | null;
        notes: string;
        review_status: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `select *
         from purchase_bills
         where organization_id = $1
           and (
             (invoice_date is not null
               and invoice_date >= $2::date
               and invoice_date < $3::date)
             or (invoice_date is null
               and created_at >= $2::date
               and created_at < $3::date)
           )
         order by invoice_date desc nulls last, created_at desc`,
        [ORG_ID, startDateInclusive, endDateExclusive],
      );
      return rows.map(mapBill);
    },

    async upsertPurchaseBill(input: UpsertPurchaseBillInput) {
      if (input.id) {
        const rows = await q<{
          id: string;
          vendor_id: string | null;
          vendor_name: string;
          vendor_gstin: string | null;
          invoice_number: string;
          invoice_date: string | Date | null;
          taxable_value: string | number;
          cgst: string | number;
          sgst: string | number;
          igst: string | number;
          cess: string | number | null;
          total_tax: string | number;
          invoice_total: string | number;
          source: string;
          source_evidence_id: string | null;
          attachment_reference: string | null;
          notes: string;
          review_status: string;
          created_at: string | Date;
          updated_at: string | Date;
        }>(
          `update purchase_bills set
             vendor_id = $3,
             vendor_name = $4,
             vendor_gstin = $5,
             invoice_number = $6,
             invoice_date = $7::date,
             taxable_value = $8,
             cgst = $9,
             sgst = $10,
             igst = $11,
             cess = $12,
             total_tax = $13,
             invoice_total = $14,
             source = coalesce($15, source),
             source_evidence_id = coalesce($16, source_evidence_id),
             attachment_reference = coalesce($17, attachment_reference),
             notes = coalesce($18, notes),
             review_status = coalesce($19, review_status),
             updated_at = now()
           where id = $1 and organization_id = $2
           returning *`,
          [
            input.id,
            ORG_ID,
            input.vendorId ?? null,
            input.vendorName,
            input.vendorGstin ?? null,
            input.invoiceNumber,
            input.invoiceDate ?? null,
            input.taxableValue,
            input.cgst,
            input.sgst,
            input.igst,
            input.cess ?? null,
            input.totalTax,
            input.invoiceTotal,
            input.source ?? null,
            input.sourceEvidenceId ?? null,
            input.attachmentReference ?? null,
            input.notes ?? null,
            input.reviewStatus ?? null,
          ],
        );
        if (!rows[0]) throw new Error("Purchase bill not found.");
        return mapBill(rows[0]);
      }

      const rows = await q<{
        id: string;
        vendor_id: string | null;
        vendor_name: string;
        vendor_gstin: string | null;
        invoice_number: string;
        invoice_date: string | Date | null;
        taxable_value: string | number;
        cgst: string | number;
        sgst: string | number;
        igst: string | number;
        cess: string | number | null;
        total_tax: string | number;
        invoice_total: string | number;
        source: string;
        source_evidence_id: string | null;
        attachment_reference: string | null;
        notes: string;
        review_status: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `insert into purchase_bills (
           organization_id, vendor_id, vendor_name, vendor_gstin,
           invoice_number, invoice_date, taxable_value, cgst, sgst, igst, cess,
           total_tax, invoice_total, source, source_evidence_id,
           attachment_reference, notes, review_status
         ) values (
           $1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
         )
         returning *`,
        [
          ORG_ID,
          input.vendorId ?? null,
          input.vendorName,
          input.vendorGstin ?? null,
          input.invoiceNumber,
          input.invoiceDate ?? null,
          input.taxableValue,
          input.cgst,
          input.sgst,
          input.igst,
          input.cess ?? null,
          input.totalTax,
          input.invoiceTotal,
          input.source ?? "manual",
          input.sourceEvidenceId ?? null,
          input.attachmentReference ?? null,
          input.notes ?? "",
          input.reviewStatus ?? "PENDING_REVIEW",
        ],
      );
      return mapBill(rows[0]!);
    },

    async findDuplicateCandidates(input) {
      const gstin = input.vendorGstin?.trim().toUpperCase() || null;
      const nameKey = input.vendorName.trim().toLowerCase();
      const inv = input.invoiceNumber.trim().toLowerCase();
      const rows = await q<{
        id: string;
        vendor_name: string;
        vendor_gstin: string | null;
        invoice_number: string;
        invoice_date: string | Date | null;
        invoice_total: string | number;
      }>(
        `select id, vendor_name, vendor_gstin, invoice_number, invoice_date, invoice_total
         from purchase_bills
         where organization_id = $1
           and lower(btrim(invoice_number)) = $2
           and (
             ($3::text is not null and upper(btrim(coalesce(vendor_gstin, ''))) = $3)
             or lower(btrim(vendor_name)) = $4
           )
           and ($5::uuid is null or id <> $5::uuid)
         limit 20`,
        [ORG_ID, inv, gstin, nameKey, input.excludeId ?? null],
      );
      return rows.map(
        (r): GstDuplicateCandidate => ({
          id: String(r.id),
          vendorName: String(r.vendor_name),
          vendorGstin: r.vendor_gstin ? String(r.vendor_gstin) : null,
          invoiceNumber: String(r.invoice_number),
          invoiceDate: isoDateOrNull(r.invoice_date),
          invoiceTotal: num(r.invoice_total),
        }),
      );
    },

    async insertEvidence(input: GstEvidenceInsert) {
      const rows = await q<{
        id: string;
        filename: string;
        mime_type: string;
        byte_size: number;
        uploaded_by: string;
        created_at: string | Date;
      }>(
        `insert into gst_document_evidence (
           organization_id, filename, mime_type, byte_size, content, uploaded_by, extraction_hints
         ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
         returning id, filename, mime_type, byte_size, uploaded_by, created_at`,
        [
          ORG_ID,
          input.filename,
          input.mimeType,
          input.content.byteLength,
          input.content,
          input.uploadedBy,
          JSON.stringify(input.extractionHints ?? {}),
        ],
      );
      const r = rows[0]!;
      const evidence: GstEvidenceRow = {
        id: String(r.id),
        filename: String(r.filename),
        mimeType: String(r.mime_type),
        byteSize: num(r.byte_size),
        uploadedBy: String(r.uploaded_by),
        createdAt: iso(r.created_at),
      };
      return evidence;
    },

    async listSalesForPeriod(startInstantIso, endExclusiveInstantIso) {
      const rows = await q<{
        order_id: string;
        order_number: string;
        order_date: string | Date;
        customer_name: string | null;
        customer_state: string | null;
        customer_gstin: string | null;
        quantity: string | number;
        gross_value: string | number;
        discount: string | number | null;
        taxable_amount: string | number | null;
        cgst: string | number | null;
        sgst: string | number | null;
        igst: string | number | null;
        shipping_amount: string | number | null;
        shipping_tax: string | number | null;
        total_refunded: string | number | null;
        net_value: string | number;
        currency: string;
        source: string;
      }>(
        `select
           o.id as order_id,
           o.order_number,
           o.order_date,
           c.name as customer_name,
           coalesce(nullif(btrim(o.shipping_province), ''), null) as customer_state,
           coalesce(nullif(btrim(o.customer_gstin), ''), null) as customer_gstin,
           coalesce((
             select sum(i.quantity) from external_order_items i
             where i.external_order_id = o.id
           ), 0)::int as quantity,
           o.total_amount as gross_value,
           o.total_discounts as discount,
           o.taxable_amount,
           o.cgst,
           o.sgst,
           o.igst,
           o.shipping_amount,
           o.shipping_tax,
           o.total_refunded,
           (o.total_amount - coalesce(o.total_refunded, 0)) as net_value,
           o.currency,
           o.provider as source
         from external_orders o
         left join external_customers c on c.id = o.external_customer_id
         where o.organization_id = $1
           and o.is_valid = true
           and o.currency = 'INR'
           and o.order_date >= $2::timestamptz
           and o.order_date < $3::timestamptz
         order by o.order_date asc, o.order_number`,
        [ORG_ID, startInstantIso, endExclusiveInstantIso],
      );

      return rows.map((r): GstSalesRow => {
        const gstin = r.customer_gstin ? String(r.customer_gstin) : null;
        return {
          orderId: String(r.order_id),
          orderNumber: String(r.order_number),
          orderDate: iso(r.order_date),
          customerName: r.customer_name ? String(r.customer_name) : null,
          customerState: r.customer_state ? String(r.customer_state) : null,
          customerGstin: gstin,
          b2b: gstin ? true : gstin === null ? null : false,
          quantity: num(r.quantity),
          grossValue: num(r.gross_value),
          discount: numOrNull(r.discount),
          taxableValue: numOrNull(r.taxable_amount),
          cgst: numOrNull(r.cgst),
          sgst: numOrNull(r.sgst),
          igst: numOrNull(r.igst),
          shipping: numOrNull(r.shipping_amount),
          shippingTax: numOrNull(r.shipping_tax),
          refunds: numOrNull(r.total_refunded),
          netValue: num(r.net_value),
          currency: String(r.currency),
          source: String(r.source),
          taxComplete: salesTaxComplete(r),
        };
      });
    },

    async listPacks(periodId) {
      const rows = await q<{
        id: string;
        period_id: string;
        version: number;
        generated_at: string | Date;
        generated_by: string;
        exception_count: number;
        xlsx_filename: string;
        has_xlsx: boolean;
      }>(
        `select id, period_id, version, generated_at, generated_by, exception_count,
                xlsx_filename, (xlsx_bytes is not null) as has_xlsx
         from gst_accountant_packs
         where organization_id = $1 and period_id = $2
         order by version desc`,
        [ORG_ID, periodId],
      );
      return rows.map(
        (r): GstAccountantPackMeta => ({
          id: String(r.id),
          periodId: String(r.period_id),
          version: num(r.version),
          generatedAt: iso(r.generated_at),
          generatedBy: String(r.generated_by ?? ""),
          exceptionCount: num(r.exception_count),
          filename: String(r.xlsx_filename ?? ""),
          hasXlsx: Boolean(r.has_xlsx),
        }),
      );
    },

    async insertPack(input: GstPackInsert) {
      const rows = await q<{
        id: string;
        period_id: string;
        version: number;
        generated_at: string | Date;
        generated_by: string;
        exception_count: number;
        xlsx_filename: string;
        payload_json: Record<string, unknown>;
      }>(
        `insert into gst_accountant_packs (
           organization_id, period_id, version, generated_by, exception_count,
           payload_json, xlsx_bytes, xlsx_filename
         ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
         returning id, period_id, version, generated_at, generated_by,
                   exception_count, xlsx_filename, payload_json`,
        [
          ORG_ID,
          input.periodId,
          input.version,
          input.generatedBy,
          input.exceptionCount,
          JSON.stringify(input.payloadJson),
          input.xlsxBytes,
          input.xlsxFilename,
        ],
      );
      const r = rows[0]!;
      const pack: GstPackRow = {
        id: String(r.id),
        periodId: String(r.period_id),
        version: num(r.version),
        generatedAt: iso(r.generated_at),
        generatedBy: String(r.generated_by ?? ""),
        exceptionCount: num(r.exception_count),
        filename: String(r.xlsx_filename ?? ""),
        hasXlsx: true,
        payloadJson:
          r.payload_json && typeof r.payload_json === "object"
            ? r.payload_json
            : input.payloadJson,
      };
      return pack;
    },

    async getPackBytes(packId) {
      const rows = await q<{
        id: string;
        period_id: string;
        version: number;
        exception_count: number;
        xlsx_filename: string;
        xlsx_bytes: Buffer | null;
      }>(
        `select id, period_id, version, exception_count, xlsx_filename, xlsx_bytes
         from gst_accountant_packs
         where organization_id = $1 and id = $2`,
        [ORG_ID, packId],
      );
      const r = rows[0];
      if (!r || !r.xlsx_bytes) return null;
      const bytes = Buffer.isBuffer(r.xlsx_bytes)
        ? r.xlsx_bytes
        : Buffer.from(r.xlsx_bytes as unknown as Uint8Array);
      return {
        id: String(r.id),
        filename: String(r.xlsx_filename || `gst-pack-${r.version}.xlsx`),
        bytes,
        periodId: String(r.period_id),
        version: num(r.version),
        exceptionCount: num(r.exception_count),
      };
    },

    async insertSend(input: GstSendInsert) {
      await q(
        `insert into gst_accountant_pack_sends (
           organization_id, pack_id, period_id, recipient, sent_by,
           exception_count, channel
         ) values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          ORG_ID,
          input.packId,
          input.periodId,
          input.recipient,
          input.sentBy,
          input.exceptionCount,
          input.channel ?? "download_mark_sent",
        ],
      );
    },

    async getLastSend(periodId) {
      const rows = await q<{
        recipient: string;
        sent_at: string | Date;
        sent_by: string;
        exception_count: number;
        pack_version: number;
      }>(
        `select s.recipient, s.sent_at, s.sent_by, s.exception_count, p.version as pack_version
         from gst_accountant_pack_sends s
         join gst_accountant_packs p on p.id = s.pack_id
         where s.organization_id = $1 and s.period_id = $2
         order by s.sent_at desc
         limit 1`,
        [ORG_ID, periodId],
      );
      const r = rows[0];
      if (!r) return null;
      const last: GstLastSendRow = {
        recipient: String(r.recipient),
        sentAt: iso(r.sent_at),
        sentBy: String(r.sent_by ?? ""),
        packVersion: num(r.pack_version),
        exceptionCount: num(r.exception_count),
      };
      return last;
    },
  };
}
