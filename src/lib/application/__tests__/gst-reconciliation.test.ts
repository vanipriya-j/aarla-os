import { describe, expect, it } from "vitest";
import { buildExceptions } from "@/lib/application/gst-reconciliation-service";
import type {
  OrganizationAccountantSettings,
  PurchaseBill,
  GstSalesRow,
} from "@/lib/domain/gst-types";

const settings: OrganizationAccountantSettings = {
  organizationId: "org",
  legalName: "Aarla",
  gstin: "29AAAAA0000A1Z5",
  state: "Karnataka",
  accountantName: "CA",
  accountantEmail: "ca@example.com",
  financialYearStartMonth: 4,
  updatedAt: null,
};

function sale(partial: Partial<GstSalesRow> = {}): GstSalesRow {
  return {
    orderId: "o1",
    orderNumber: "#1",
    orderDate: "2026-04-02T00:00:00.000Z",
    customerName: "A",
    customerState: "Karnataka",
    customerGstin: null,
    b2b: null,
    quantity: 1,
    grossValue: 1180,
    discount: 0,
    taxableValue: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    shipping: 0,
    shippingTax: 0,
    refunds: 0,
    netValue: 1180,
    currency: "INR",
    source: "shopify",
    taxComplete: true,
    ...partial,
  };
}

function bill(partial: Partial<PurchaseBill> = {}): PurchaseBill {
  return {
    id: "b1",
    vendorId: null,
    vendorName: "Vendor",
    vendorGstin: "29BBBBB0000B1Z5",
    invoiceNumber: "P-1",
    invoiceDate: "2026-04-05",
    taxableValue: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    cess: null,
    totalTax: 180,
    invoiceTotal: 1180,
    source: "manual",
    sourceEvidenceId: null,
    attachmentReference: null,
    notes: "",
    reviewStatus: "REVIEWED",
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
    ...partial,
  };
}

describe("buildExceptions", () => {
  it("flags incomplete org settings as blocker", () => {
    const ex = buildExceptions({
      settings: { ...settings, gstin: "" },
      sales: [],
      purchases: [],
    });
    expect(ex.some((e) => e.code === "ORG_SETTINGS_INCOMPLETE")).toBe(true);
  });

  it("flags incomplete sales tax and pending purchases", () => {
    const ex = buildExceptions({
      settings,
      sales: [sale({ taxComplete: false, customerState: null })],
      purchases: [bill({ reviewStatus: "PENDING_REVIEW" })],
    });
    expect(ex.some((e) => e.code === "INCOMPLETE_SALES_TAX")).toBe(true);
    expect(ex.some((e) => e.code === "MISSING_CUSTOMER_STATE")).toBe(true);
    expect(ex.some((e) => e.code === "PURCHASE_AWAITING_REVIEW")).toBe(true);
  });

  it("flags arithmetic mismatch on purchases", () => {
    const ex = buildExceptions({
      settings,
      sales: [],
      purchases: [bill({ invoiceTotal: 9999, reviewStatus: "REVIEWED" })],
    });
    expect(ex.some((e) => e.code === "GST_ARITHMETIC_MISMATCH")).toBe(true);
  });
});
