import {
  createGstReconciliationRepository,
} from "@/lib/infra/repositories/postgres-gst-reconciliation";
import {
  financialYearForDate,
  invoiceArithmeticOk,
  isLikelyDuplicateBill,
  periodBounds,
  purchaseBillDuplicateKey,
  totalTaxBreakdownOk,
} from "@/lib/domain/gst-validation";
import type {
  GstAccountantPackMeta,
  GstBoard,
  GstException,
  GstPeriodStatus,
  GstPurchaseTotals,
  GstSalesRow,
  GstSalesTotals,
  OrganizationAccountantSettings,
  PurchaseBill,
  UpsertPurchaseBillInput,
} from "@/lib/domain/gst-types";
import { buildXlsxBuffer, type GstPackPayload } from "@/lib/application/gst-pack-xlsx";
import type {
  GstReconciliationRepository,
  UpsertAccountantSettingsInput,
} from "@/lib/repositories/gst-reconciliation";

function repo(): GstReconciliationRepository {
  return createGstReconciliationRepository();
}

const ALLOWED_TRANSITIONS: Record<GstPeriodStatus, GstPeriodStatus[]> = {
  COLLECTING: ["NEEDS_REVIEW"],
  NEEDS_REVIEW: ["READY", "COLLECTING"],
  READY: ["NEEDS_REVIEW", "SENT"],
  SENT: ["NEEDS_REVIEW"],
};

function monthLabel(month: number): string {
  return (
    [
      "",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][month] ?? String(month)
  );
}

function sumSales(rows: GstSalesRow[]): GstSalesTotals {
  return {
    grossSales: rows.reduce((s, r) => s + r.grossValue, 0),
    taxableSales: rows.reduce((s, r) => s + (r.taxableValue ?? 0), 0),
    cgst: rows.reduce((s, r) => s + (r.cgst ?? 0), 0),
    sgst: rows.reduce((s, r) => s + (r.sgst ?? 0), 0),
    igst: rows.reduce((s, r) => s + (r.igst ?? 0), 0),
    refunds: rows.reduce((s, r) => s + (r.refunds ?? 0), 0),
    netSales: rows.reduce((s, r) => s + r.netValue, 0),
    orderCount: rows.length,
  };
}

function sumPurchases(bills: PurchaseBill[]): GstPurchaseTotals {
  const included = bills.filter((b) => b.reviewStatus !== "EXCLUDED");
  return {
    billCount: included.length,
    taxablePurchases: included.reduce((s, b) => s + b.taxableValue, 0),
    capturedCgst: included.reduce((s, b) => s + b.cgst, 0),
    capturedSgst: included.reduce((s, b) => s + b.sgst, 0),
    capturedIgst: included.reduce((s, b) => s + b.igst, 0),
    capturedPurchaseTax: included.reduce((s, b) => s + b.totalTax, 0),
  };
}

export function buildExceptions(input: {
  settings: OrganizationAccountantSettings;
  sales: GstSalesRow[];
  purchases: PurchaseBill[];
}): GstException[] {
  const exceptions: GstException[] = [];

  if (
    !input.settings.legalName.trim() ||
    !input.settings.gstin.trim() ||
    !input.settings.state.trim()
  ) {
    exceptions.push({
      code: "ORG_SETTINGS_INCOMPLETE",
      severity: "blocker",
      message: "Organisation GST profile is incomplete (legal name, GSTIN, or state).",
      entityType: "org",
      entityId: input.settings.organizationId,
      actionHint: "Complete accountant settings before marking the period Ready.",
    });
  }

  for (const sale of input.sales) {
    if (!sale.customerState) {
      exceptions.push({
        code: "MISSING_CUSTOMER_STATE",
        severity: "warning",
        message: `Order ${sale.orderNumber} has no shipping state / place of supply.`,
        entityType: "sale",
        entityId: sale.orderId,
        actionHint: "Re-sync Shopify after tax columns deploy, or note for accountant.",
      });
    }
    if (!sale.taxComplete) {
      exceptions.push({
        code: "INCOMPLETE_SALES_TAX",
        severity: "warning",
        message: `Order ${sale.orderNumber} is missing taxable / GST break-up columns.`,
        entityType: "sale",
        entityId: sale.orderId,
        actionHint: "Re-sync Shopify so tax lines populate; do not invent amounts.",
      });
    }
    if (sale.source && sale.source !== "shopify") {
      exceptions.push({
        code: "UNSUPPORTED_SALES_SOURCE",
        severity: "warning",
        message: `Order ${sale.orderNumber} source “${sale.source}” is outside the Shopify pack path.`,
        entityType: "sale",
        entityId: sale.orderId,
        actionHint: "Confirm with accountant how non-Shopify sales are handled.",
      });
    }
  }

  const keys = input.purchases.map((b) => ({
    bill: b,
    key: purchaseBillDuplicateKey({
      vendorGstin: b.vendorGstin,
      vendorName: b.vendorName,
      invoiceNumber: b.invoiceNumber,
      invoiceDate: b.invoiceDate,
      invoiceTotal: b.invoiceTotal,
    }),
  }));

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (isLikelyDuplicateBill(keys[i]!.key, keys[j]!.key)) {
        exceptions.push({
          code: "DUPLICATE_INVOICE",
          severity: "blocker",
          message: `Possible duplicate purchase invoice ${keys[i]!.bill.invoiceNumber}.`,
          entityType: "purchase",
          entityId: keys[i]!.bill.id,
          actionHint: "Review both bills and exclude or correct the duplicate.",
        });
        break;
      }
    }
  }

  for (const bill of input.purchases) {
    if (bill.reviewStatus === "EXCLUDED") continue;

    if (!bill.invoiceNumber.trim()) {
      exceptions.push({
        code: "MISSING_INVOICE_NUMBER",
        severity: "blocker",
        message: `Purchase bill for ${bill.vendorName || "vendor"} is missing an invoice number.`,
        entityType: "purchase",
        entityId: bill.id,
        actionHint: "Enter the tax invoice number from the vendor bill.",
      });
    }
    if (!bill.vendorGstin?.trim()) {
      exceptions.push({
        code: "MISSING_GSTIN",
        severity: "warning",
        message: `Purchase ${bill.invoiceNumber || bill.id} has no vendor GSTIN.`,
        entityType: "purchase",
        entityId: bill.id,
        actionHint: "Capture vendor GSTIN when present on the tax invoice.",
      });
    }
    if (
      !invoiceArithmeticOk({
        taxableValue: bill.taxableValue,
        cgst: bill.cgst,
        sgst: bill.sgst,
        igst: bill.igst,
        cess: bill.cess,
        invoiceTotal: bill.invoiceTotal,
      }) ||
      !totalTaxBreakdownOk({
        cgst: bill.cgst,
        sgst: bill.sgst,
        igst: bill.igst,
        cess: bill.cess,
        totalTax: bill.totalTax,
      })
    ) {
      exceptions.push({
        code: "GST_ARITHMETIC_MISMATCH",
        severity: "blocker",
        message: `Purchase ${bill.invoiceNumber || bill.id} tax arithmetic does not reconcile (±₹1).`,
        entityType: "purchase",
        entityId: bill.id,
        actionHint: "Correct taxable / CGST / SGST / IGST / total from the invoice.",
      });
    }
    if (bill.reviewStatus === "PENDING_REVIEW") {
      exceptions.push({
        code: "PURCHASE_AWAITING_REVIEW",
        severity: "warning",
        message: `Purchase ${bill.invoiceNumber || bill.id} is still pending review.`,
        entityType: "purchase",
        entityId: bill.id,
        actionHint: "Mark Reviewed (or Issue / Excluded) before Ready.",
      });
    }
  }

  return exceptions;
}

function defaultFyMonth(settings: OrganizationAccountantSettings): {
  financialYear: string;
  month: number;
} {
  return financialYearForDate(new Date(), settings.financialYearStartMonth || 4);
}

export async function getGstBoard(
  financialYear?: string,
  month?: number,
): Promise<GstBoard> {
  const r = repo();
  const settings = await r.getAccountantSettings();
  const defaults = defaultFyMonth(settings);
  const fy = financialYear?.trim() || defaults.financialYear;
  const m = month && month >= 1 && month <= 12 ? month : defaults.month;

  const period = await r.getOrCreatePeriod(fy, m);
  const bounds = periodBounds(fy, m, settings.financialYearStartMonth || 4);
  const startDate = bounds.startIso.slice(0, 10);
  const endDate = bounds.endExclusiveIso.slice(0, 10);

  const [salesRows, purchaseBills, packs, lastSend] = await Promise.all([
    r.listSalesForPeriod(bounds.startIso, bounds.endExclusiveIso),
    r.listPurchaseBillsInRange(startDate, endDate),
    r.listPacks(period.id),
    r.getLastSend(period.id),
  ]);

  const exceptions = buildExceptions({
    settings,
    sales: salesRows,
    purchases: purchaseBills,
  });

  // Keep exception_count current for the period without forcing status changes.
  if (period.exceptionCount !== exceptions.length) {
    await r.updatePeriodStatus(period.id, period.status, exceptions.length);
    period.exceptionCount = exceptions.length;
  }

  return {
    period: {
      id: period.id,
      financialYear: period.financialYear,
      month: period.month,
      status: period.status,
      exceptionCount: exceptions.length,
      notes: period.notes,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
    },
    settings,
    sales: { totals: sumSales(salesRows), rows: salesRows },
    purchases: { totals: sumPurchases(purchaseBills), bills: purchaseBills },
    exceptions,
    packs,
    lastSend,
  };
}

export async function upsertPurchaseBill(
  input: UpsertPurchaseBillInput,
): Promise<PurchaseBill> {
  if (!input.vendorName?.trim()) {
    throw new Error("Vendor name is required.");
  }
  if (!Number.isFinite(input.taxableValue) || !Number.isFinite(input.invoiceTotal)) {
    throw new Error("Taxable value and invoice total must be numbers.");
  }
  return repo().upsertPurchaseBill({
    ...input,
    vendorName: input.vendorName.trim(),
    invoiceNumber: (input.invoiceNumber ?? "").trim(),
    vendorGstin: input.vendorGstin?.trim() || null,
    source: input.source ?? "manual",
  });
}

export async function saveSettings(
  input: UpsertAccountantSettingsInput,
): Promise<OrganizationAccountantSettings> {
  return repo().upsertAccountantSettings({
    legalName: input.legalName?.trim() ?? "",
    gstin: input.gstin?.trim() ?? "",
    state: input.state?.trim() ?? "",
    accountantName: input.accountantName?.trim() ?? "",
    accountantEmail: input.accountantEmail?.trim() ?? "",
    financialYearStartMonth: input.financialYearStartMonth ?? 4,
  });
}

export async function setPeriodStatus(
  financialYear: string,
  month: number,
  status: GstPeriodStatus,
): Promise<GstBoard> {
  const r = repo();
  const board = await getGstBoard(financialYear, month);
  const current = board.period.status;
  if (current === status) return board;

  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(status)) {
    throw new Error(`Cannot move period from ${current} to ${status}.`);
  }
  if (status === "READY") {
    const blockers = board.exceptions.filter((e) => e.severity === "blocker");
    if (blockers.length > 0) {
      throw new Error(
        `Cannot mark Ready while ${blockers.length} blocker exception(s) remain.`,
      );
    }
  }
  if (status === "SENT") {
    throw new Error("Use Mark Sent on an accountant pack to set SENT.");
  }

  await r.updatePeriodStatus(board.period.id, status, board.exceptions.length);
  return getGstBoard(financialYear, month);
}

export async function generateAccountantPack(input: {
  financialYear: string;
  month: number;
  generatedBy?: string;
}): Promise<{ pack: GstAccountantPackMeta; board: GstBoard }> {
  const r = repo();
  const board = await getGstBoard(input.financialYear, input.month);
  const nextVersion =
    board.packs.reduce((max, p) => Math.max(max, p.version), 0) + 1;

  const sourceMap = new Map<string, { orderCount: number; grossSales: number }>();
  for (const row of board.sales.rows) {
    const cur = sourceMap.get(row.source) ?? { orderCount: 0, grossSales: 0 };
    cur.orderCount += 1;
    cur.grossSales += row.grossValue;
    sourceMap.set(row.source, cur);
  }

  const refunds = board.sales.rows
    .filter((row) => (row.refunds ?? 0) > 0)
    .map((row) => ({
      orderNumber: row.orderNumber,
      orderDate: row.orderDate,
      customerName: row.customerName,
      refunds: row.refunds,
      grossValue: row.grossValue,
      netValue: row.netValue,
      source: row.source,
    }));

  const generatedAt = new Date().toISOString();
  const payload: GstPackPayload = {
    period: {
      financialYear: board.period.financialYear,
      month: board.period.month,
      status: board.period.status,
    },
    settings: {
      legalName: board.settings.legalName,
      gstin: board.settings.gstin,
      state: board.settings.state,
      accountantName: board.settings.accountantName,
      accountantEmail: board.settings.accountantEmail,
    },
    sales: {
      totals: board.sales.totals,
      rows: board.sales.rows as unknown as Array<Record<string, unknown>>,
    },
    purchases: {
      totals: board.purchases.totals,
      bills: board.purchases.bills as unknown as Array<Record<string, unknown>>,
    },
    refunds,
    exceptions: board.exceptions as unknown as Array<Record<string, unknown>>,
    sourceSummary: [...sourceMap.entries()].map(([source, v]) => ({
      source,
      orderCount: v.orderCount,
      grossSales: v.grossSales,
    })),
    generatedAt,
  };

  const xlsxBytes = await buildXlsxBuffer(payload);
  const filename = `aarla-gst-${board.period.financialYear}-m${String(board.period.month).padStart(2, "0")}-v${nextVersion}.xlsx`;

  const pack = await r.insertPack({
    periodId: board.period.id,
    version: nextVersion,
    generatedBy: input.generatedBy?.trim() || "operator",
    exceptionCount: board.exceptions.length,
    payloadJson: payload as unknown as Record<string, unknown>,
    xlsxBytes,
    xlsxFilename: filename,
  });

  const refreshed = await getGstBoard(input.financialYear, input.month);
  return {
    pack: {
      id: pack.id,
      periodId: pack.periodId,
      version: pack.version,
      generatedAt: pack.generatedAt,
      generatedBy: pack.generatedBy,
      exceptionCount: pack.exceptionCount,
      filename: pack.filename,
      hasXlsx: pack.hasXlsx,
    },
    board: refreshed,
  };
}

export async function markPackSent(input: {
  packId: string;
  recipient: string;
  sentBy?: string;
}): Promise<GstBoard> {
  const r = repo();
  const pack = await r.getPackBytes(input.packId);
  if (!pack) throw new Error("Accountant pack not found.");
  const recipient = input.recipient.trim();
  if (!recipient) throw new Error("Recipient is required.");

  await r.insertSend({
    packId: pack.id,
    periodId: pack.periodId,
    recipient,
    sentBy: input.sentBy?.trim() || "operator",
    exceptionCount: pack.exceptionCount,
    channel: "download_mark_sent",
  });
  const period = await r.updatePeriodStatus(
    pack.periodId,
    "SENT",
    pack.exceptionCount,
  );
  return getGstBoard(period.financialYear, period.month);
}

export async function getPackDownload(packId: string): Promise<{
  filename: string;
  bytesBase64: string;
  contentType: string;
}> {
  const pack = await repo().getPackBytes(packId);
  if (!pack) throw new Error("Accountant pack not found.");
  return {
    filename: pack.filename,
    bytesBase64: pack.bytes.toString("base64"),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

export { monthLabel, periodBounds, financialYearForDate };
