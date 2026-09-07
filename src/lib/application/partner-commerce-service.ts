import "server-only";

import { createPartnerCommerceRepository } from "@/lib/infra/repositories/postgres-partner-commerce";

const repo = () => createPartnerCommerceRepository();

export const PartnerCommerceService = {
  listUnbilledSales: (partnerCode: string) => repo().listUnbilledSales(partnerCode),
  listInvoices: (partnerCode?: string) => repo().listInvoices(partnerCode),
  getInvoice: (idOrCode: string) => repo().getInvoice(idOrCode),
  raiseInvoice: (input: {
    partnerCode: string;
    movementUuids: string[];
    adjustedTotal: number;
    notes?: string;
    issue?: boolean;
  }) =>
    repo().createInvoiceFromSales({
      partnerCode: input.partnerCode,
      movementUuids: input.movementUuids,
      adjustedTotal: input.adjustedTotal,
      notes: input.notes,
      issue: input.issue ?? true,
    }),
  receivePayment: (input: {
    invoiceId: string;
    amount: number;
    notes?: string;
    paidAt?: string;
    screenshotBase64?: string | null;
    screenshotFilename?: string;
    screenshotMimeType?: string;
  }) => {
    let attachment: { filename: string; mimeType: string; content: Buffer } | null = null;
    if (input.screenshotBase64) {
      const content = Buffer.from(input.screenshotBase64, "base64");
      if (content.length > 5 * 1024 * 1024) {
        throw new Error("Screenshot must be under 5 MB");
      }
      attachment = {
        filename: input.screenshotFilename || "payment-screenshot.jpg",
        mimeType: input.screenshotMimeType || "image/jpeg",
        content,
      };
    }
    return repo().recordPayment({
      invoiceId: input.invoiceId,
      amount: input.amount,
      notes: input.notes,
      paidAt: input.paidAt,
      attachment,
    });
  },
  getPaymentAttachment: (id: string) => repo().getPaymentAttachment(id),
};
