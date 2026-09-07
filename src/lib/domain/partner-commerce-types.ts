/** Partner commercial docs — invoices from collated sales + payments. */

export type PartnerInvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "void";

export type UnbilledPartnerSale = {
  movementId: string; // domain code
  movementUuid: string;
  date: string;
  productId: string;
  productTitle: string;
  variantId?: string;
  variantLabel?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  reference: string;
};

export type PartnerInvoiceLine = {
  id: string;
  movementId: string | null;
  productId: string | null;
  variantId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PartnerInvoice = {
  id: string;
  code: string;
  partnerId: string;
  partnerName: string;
  status: PartnerInvoiceStatus;
  currency: string;
  computedTotal: number;
  adjustedTotal: number;
  amountPaid: number;
  balanceDue: number;
  notes: string;
  issuedAt: string | null;
  createdAt: string;
  lines: PartnerInvoiceLine[];
};

export type PartnerPayment = {
  id: string;
  code: string;
  invoiceId: string;
  invoiceCode: string;
  partnerId: string;
  amount: number;
  paidAt: string;
  notes: string;
  attachmentIds: string[];
};
