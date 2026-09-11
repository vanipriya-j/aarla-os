import "server-only";

import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/infra/db/pool";
import { ORG_ID, stableId } from "@/lib/infra/db/ids";
import type {
  PartnerInvoice,
  PartnerInvoiceLine,
  PartnerInvoiceStatus,
  PartnerPayment,
  UnbilledPartnerSale,
} from "@/lib/domain/partner-commerce-types";

type Q = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function poolQ(): Q {
  return async (text, params) => {
    const r = await getPool().query(text, params);
    return r.rows as never;
  };
}

function num(v: unknown): number {
  return Number(v ?? 0);
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

export function createPartnerCommerceRepository(q: Q = poolQ()) {
  async function loadLines(invoiceId: string): Promise<PartnerInvoiceLine[]> {
    const rows = await q<{
      id: string;
      movement_code: string | null;
      product_code: string | null;
      variant_code: string | null;
      description: string;
      quantity: number;
      unit_price: unknown;
      line_total: unknown;
    }>(
      `select pil.id,
              sm.code as movement_code,
              p.code as product_code,
              pv.code as variant_code,
              pil.description, pil.quantity, pil.unit_price, pil.line_total
       from partner_invoice_lines pil
       left join stock_movements sm on sm.id = pil.movement_id
       left join products p on p.id = pil.product_id
       left join product_variants pv on pv.id = pil.variant_id
       where pil.invoice_id = $1::uuid
       order by pil.created_at`,
      [invoiceId],
    );
    return rows.map((r) => ({
      id: r.id,
      movementId: r.movement_code,
      productId: r.product_code,
      variantId: r.variant_code,
      description: r.description,
      quantity: r.quantity,
      unitPrice: num(r.unit_price),
      lineTotal: num(r.line_total),
    }));
  }

  async function mapInvoice(r: {
    id: string;
    code: string;
    partner_code: string;
    partner_name: string;
    status: PartnerInvoiceStatus;
    currency: string;
    computed_total: unknown;
    adjusted_total: unknown;
    amount_paid: unknown;
    notes: string;
    issued_at: Date | null;
    created_at: Date;
  }): Promise<PartnerInvoice> {
    const lines = await loadLines(r.id);
    const adjusted = num(r.adjusted_total);
    const paid = num(r.amount_paid);
    return {
      id: r.id,
      code: r.code,
      partnerId: r.partner_code,
      partnerName: r.partner_name,
      status: r.status,
      currency: r.currency,
      computedTotal: num(r.computed_total),
      adjustedTotal: adjusted,
      amountPaid: paid,
      balanceDue: Math.max(0, Math.round((adjusted - paid) * 100) / 100),
      notes: r.notes,
      issuedAt: iso(r.issued_at),
      createdAt: iso(r.created_at)!,
      lines,
    };
  }

  return {
    async listUnbilledSales(partnerCode: string): Promise<UnbilledPartnerSale[]> {
      const partnerUuid = stableId(partnerCode);
      const rows = await q<{
        movement_uuid: string;
        movement_code: string;
        movement_date: string | Date;
        product_code: string;
        product_title: string;
        selling_price: unknown;
        variant_code: string | null;
        variant_label: string | null;
        quantity: number;
        reference: string;
      }>(
        `select sm.id as movement_uuid, sm.code as movement_code, sm.movement_date,
                p.code as product_code, p.title as product_title, p.selling_price,
                pv.code as variant_code, pv.label as variant_label,
                sm.quantity, sm.reference
         from stock_movements sm
         join locations loc on loc.id = sm.from_location_id
         join products p on p.id = sm.product_id
         left join product_variants pv on pv.id = sm.variant_id
         where sm.organization_id = $1
           and loc.partner_id = $2::uuid
           and sm.movement_type = 'Partner Sale'
           and not exists (
             select 1
             from partner_invoice_lines pil
             join partner_invoices pi on pi.id = pil.invoice_id
             where pil.movement_id = sm.id
               and pi.status <> 'void'
           )
         order by sm.movement_date asc, sm.created_at asc`,
        [ORG_ID, partnerUuid],
      );
      return rows.map((r) => {
        const unitPrice = num(r.selling_price);
        const quantity = r.quantity;
        return {
          movementId: r.movement_code,
          movementUuid: r.movement_uuid,
          date:
            typeof r.movement_date === "string"
              ? r.movement_date.slice(0, 10)
              : r.movement_date.toISOString().slice(0, 10),
          productId: r.product_code,
          productTitle: r.product_title,
          variantId: r.variant_code ?? undefined,
          variantLabel: r.variant_label ?? undefined,
          quantity,
          unitPrice,
          lineTotal: Math.round(unitPrice * quantity * 100) / 100,
          reference: r.reference,
        };
      });
    },

    async listInvoices(partnerCode?: string): Promise<PartnerInvoice[]> {
      const rows = await q<{
        id: string;
        code: string;
        partner_code: string;
        partner_name: string;
        status: PartnerInvoiceStatus;
        currency: string;
        computed_total: unknown;
        adjusted_total: unknown;
        amount_paid: unknown;
        notes: string;
        issued_at: Date | null;
        created_at: Date;
      }>(
        `select pi.id, pi.code, pt.code as partner_code, pt.name as partner_name,
                pi.status, pi.currency, pi.computed_total, pi.adjusted_total,
                pi.amount_paid, pi.notes, pi.issued_at, pi.created_at
         from partner_invoices pi
         join partners pt on pt.id = pi.partner_id
         where pi.organization_id = $1
           ${partnerCode ? "and pt.code = $2" : ""}
         order by pi.created_at desc
         limit 100`,
        partnerCode ? [ORG_ID, partnerCode] : [ORG_ID],
      );
      return Promise.all(rows.map(mapInvoice));
    },

    async getInvoice(invoiceIdOrCode: string): Promise<PartnerInvoice | null> {
      const rows = await q<{
        id: string;
        code: string;
        partner_code: string;
        partner_name: string;
        status: PartnerInvoiceStatus;
        currency: string;
        computed_total: unknown;
        adjusted_total: unknown;
        amount_paid: unknown;
        notes: string;
        issued_at: Date | null;
        created_at: Date;
      }>(
        `select pi.id, pi.code, pt.code as partner_code, pt.name as partner_name,
                pi.status, pi.currency, pi.computed_total, pi.adjusted_total,
                pi.amount_paid, pi.notes, pi.issued_at, pi.created_at
         from partner_invoices pi
         join partners pt on pt.id = pi.partner_id
         where pi.organization_id = $1
           and (pi.id::text = $2 or pi.code = $2)
         limit 1`,
        [ORG_ID, invoiceIdOrCode],
      );
      return rows[0] ? mapInvoice(rows[0]) : null;
    },

    async createInvoiceFromSales(input: {
      partnerCode: string;
      movementUuids: string[];
      adjustedTotal: number;
      notes?: string;
      issue: boolean;
    }): Promise<PartnerInvoice> {
      const partnerUuid = stableId(input.partnerCode);
      const sales = await this.listUnbilledSales(input.partnerCode);
      const selected = sales.filter((s) => input.movementUuids.includes(s.movementUuid));
      if (!selected.length) {
        throw new Error("No unbilled sales selected");
      }
      const computed = Math.round(
        selected.reduce((s, line) => s + line.lineTotal, 0) * 100,
      ) / 100;
      const adjusted =
        Number.isFinite(input.adjustedTotal) && input.adjustedTotal >= 0
          ? Math.round(input.adjustedTotal * 100) / 100
          : computed;

      const countRows = await q<{ n: string }>(
        `select count(*)::text as n from partner_invoices
         where organization_id = $1 and partner_id = $2::uuid`,
        [ORG_ID, partnerUuid],
      );
      const seq = Number(countRows[0]?.n ?? 0) + 1;
      const short = input.partnerCode.replace(/^partner-/i, "").toUpperCase().slice(0, 12);
      const code = `INV-${short}-${String(seq).padStart(3, "0")}`;
      const invoiceId = randomUUID();
      const status: PartnerInvoiceStatus = input.issue ? "issued" : "draft";

      await q(
        `insert into partner_invoices (
           id, organization_id, partner_id, code, status, currency,
           computed_total, adjusted_total, amount_paid, notes, issued_at
         ) values (
           $1::uuid, $2, $3::uuid, $4, $5, 'INR',
           $6, $7, 0, $8, case when $5 = 'issued' then now() else null end
         )`,
        [
          invoiceId,
          ORG_ID,
          partnerUuid,
          code,
          status,
          computed,
          adjusted,
          input.notes?.trim() ?? "",
        ],
      );

      for (const line of selected) {
        await q(
          `insert into partner_invoice_lines (
             invoice_id, movement_id, product_id, variant_id,
             quantity, unit_price, line_total, description
           ) values (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid,
             $5, $6, $7, $8
           )`,
          [
            invoiceId,
            line.movementUuid,
            stableId(line.productId),
            line.variantId ? stableId(line.variantId) : null,
            line.quantity,
            line.unitPrice,
            line.lineTotal,
            `${line.productTitle}${line.variantLabel ? ` · ${line.variantLabel}` : ""} ×${line.quantity}`,
          ],
        );
      }

      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) throw new Error("Failed to load invoice");
      return invoice;
    },

    async recordPayment(input: {
      invoiceId: string;
      amount: number;
      notes?: string;
      paidAt?: string;
      attachment?: { filename: string; mimeType: string; content: Buffer } | null;
    }): Promise<{ payment: PartnerPayment; invoice: PartnerInvoice }> {
      if (input.amount <= 0) throw new Error("Payment amount must be positive");
      const invoice = await this.getInvoice(input.invoiceId);
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status === "void" || invoice.status === "draft") {
        throw new Error("Invoice must be issued before receiving payment");
      }

      const paymentId = randomUUID();
      const payCount = await q<{ n: string }>(
        `select count(*)::text as n from partner_payments
         where organization_id = $1 and partner_id = $2::uuid`,
        [ORG_ID, stableId(invoice.partnerId)],
      );
      const seq = Number(payCount[0]?.n ?? 0) + 1;
      const code = `PAY-${invoice.code.replace(/^INV-/, "")}-${String(seq).padStart(3, "0")}`;

      await q(
        `insert into partner_payments (
           id, organization_id, partner_id, invoice_id, code, amount, paid_at, notes
         ) values (
           $1::uuid, $2, $3::uuid, $4::uuid, $5, $6,
           coalesce($7::timestamptz, now()), $8
         )`,
        [
          paymentId,
          ORG_ID,
          stableId(invoice.partnerId),
          invoice.id,
          code,
          input.amount,
          input.paidAt ?? null,
          input.notes?.trim() ?? "",
        ],
      );

      const attachmentIds: string[] = [];
      if (input.attachment) {
        const attId = randomUUID();
        await q(
          `insert into partner_payment_attachments (
             id, payment_id, filename, mime_type, byte_size, content
           ) values ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
          [
            attId,
            paymentId,
            input.attachment.filename,
            input.attachment.mimeType,
            input.attachment.content.length,
            input.attachment.content,
          ],
        );
        attachmentIds.push(attId);
      }

      const newPaid = Math.round((invoice.amountPaid + input.amount) * 100) / 100;
      let status: PartnerInvoiceStatus = invoice.status;
      if (newPaid >= invoice.adjustedTotal - 0.001) status = "paid";
      else if (newPaid > 0) status = "partially_paid";

      await q(
        `update partner_invoices set
           amount_paid = $3, status = $4, updated_at = now()
         where id = $1::uuid and organization_id = $2`,
        [invoice.id, ORG_ID, newPaid, status],
      );

      // Soft commercial signal on partner master
      const paymentStatus = status === "paid" ? "Current" : "Pending";
      await q(
        `update partners set payment_status = $3, updated_at = now()
         where organization_id = $1 and code = $2`,
        [ORG_ID, invoice.partnerId, paymentStatus],
      );

      const updated = await this.getInvoice(invoice.id);
      if (!updated) throw new Error("Invoice missing after payment");

      return {
        payment: {
          id: paymentId,
          code,
          invoiceId: invoice.id,
          invoiceCode: invoice.code,
          partnerId: invoice.partnerId,
          amount: input.amount,
          paidAt: input.paidAt ?? new Date().toISOString(),
          notes: input.notes?.trim() ?? "",
          attachmentIds,
        },
        invoice: updated,
      };
    },

    async getPaymentAttachment(attachmentId: string) {
      const rows = await q<{
        filename: string;
        mime_type: string;
        content: Buffer;
      }>(
        `select a.filename, a.mime_type, a.content
         from partner_payment_attachments a
         join partner_payments p on p.id = a.payment_id
         where a.id = $1::uuid and p.organization_id = $2`,
        [attachmentId, ORG_ID],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        filename: r.filename,
        mimeType: r.mime_type,
        content: Buffer.isBuffer(r.content) ? r.content : Buffer.from(r.content),
      };
    },
  };
}
