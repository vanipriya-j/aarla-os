export type GstPeriodStatus = "COLLECTING" | "NEEDS_REVIEW" | "READY" | "SENT";

export type PurchaseBillReviewStatus =
  | "PENDING_REVIEW"
  | "REVIEWED"
  | "ISSUE"
  | "EXCLUDED";

export type PurchaseBillSource = "manual" | "upload";

export type GstExceptionCode =
  | "MISSING_GSTIN"
  | "MISSING_INVOICE_NUMBER"
  | "DUPLICATE_INVOICE"
  | "GST_ARITHMETIC_MISMATCH"
  | "MISSING_CUSTOMER_STATE"
  | "INCOMPLETE_SALES_TAX"
  | "PURCHASE_AWAITING_REVIEW"
  | "UNSUPPORTED_SALES_SOURCE"
  | "ORG_SETTINGS_INCOMPLETE";

export interface OrganizationAccountantSettings {
  organizationId: string;
  legalName: string;
  gstin: string;
  state: string;
  accountantName: string;
  accountantEmail: string;
  financialYearStartMonth: number;
  updatedAt: string | null;
}

export interface PurchaseBill {
  id: string;
  vendorId: string | null;
  vendorName: string;
  vendorGstin: string | null;
  invoiceNumber: string;
  invoiceDate: string | null;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number | null;
  totalTax: number;
  invoiceTotal: number;
  source: PurchaseBillSource;
  sourceEvidenceId: string | null;
  attachmentReference: string | null;
  notes: string;
  reviewStatus: PurchaseBillReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPurchaseBillInput {
  id?: string;
  vendorId?: string | null;
  vendorName: string;
  vendorGstin?: string | null;
  invoiceNumber: string;
  invoiceDate?: string | null;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess?: number | null;
  totalTax: number;
  invoiceTotal: number;
  source?: PurchaseBillSource;
  sourceEvidenceId?: string | null;
  attachmentReference?: string | null;
  notes?: string;
  reviewStatus?: PurchaseBillReviewStatus;
}

export interface GstException {
  code: GstExceptionCode;
  severity: "warning" | "blocker";
  message: string;
  entityType: "sale" | "purchase" | "org" | "period";
  entityId: string | null;
  actionHint: string;
}

export interface GstSalesRow {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  customerName: string | null;
  customerState: string | null;
  customerGstin: string | null;
  b2b: boolean | null;
  quantity: number;
  grossValue: number;
  discount: number | null;
  taxableValue: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  shipping: number | null;
  shippingTax: number | null;
  refunds: number | null;
  netValue: number;
  currency: string;
  source: string;
  taxComplete: boolean;
}

export interface GstSalesTotals {
  grossSales: number;
  taxableSales: number;
  cgst: number;
  sgst: number;
  igst: number;
  refunds: number;
  netSales: number;
  orderCount: number;
}

export interface GstPurchaseTotals {
  billCount: number;
  taxablePurchases: number;
  capturedCgst: number;
  capturedSgst: number;
  capturedIgst: number;
  capturedPurchaseTax: number;
}

export interface GstReconciliationPeriod {
  id: string;
  financialYear: string;
  month: number;
  status: GstPeriodStatus;
  exceptionCount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface GstAccountantPackMeta {
  id: string;
  periodId: string;
  version: number;
  generatedAt: string;
  generatedBy: string;
  exceptionCount: number;
  filename: string;
  hasXlsx: boolean;
}

export interface GstBoard {
  period: GstReconciliationPeriod;
  settings: OrganizationAccountantSettings;
  sales: { totals: GstSalesTotals; rows: GstSalesRow[] };
  purchases: { totals: GstPurchaseTotals; bills: PurchaseBill[] };
  exceptions: GstException[];
  packs: GstAccountantPackMeta[];
  lastSend: {
    recipient: string;
    sentAt: string;
    sentBy: string;
    packVersion: number;
    exceptionCount: number;
  } | null;
}
