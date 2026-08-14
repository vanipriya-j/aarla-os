import ExcelJS from "exceljs";

export type GstPackPayload = {
  period: {
    financialYear: string;
    month: number;
    status: string;
  };
  settings: {
    legalName: string;
    gstin: string;
    state: string;
    accountantName: string;
    accountantEmail: string;
  };
  sales: {
    totals: {
      grossSales: number;
      taxableSales: number;
      cgst: number;
      sgst: number;
      igst: number;
      refunds: number;
      netSales: number;
      orderCount: number;
    };
    rows: Array<Record<string, unknown>>;
  };
  purchases: {
    totals: {
      billCount: number;
      taxablePurchases: number;
      capturedCgst: number;
      capturedSgst: number;
      capturedIgst: number;
      capturedPurchaseTax: number;
    };
    bills: Array<Record<string, unknown>>;
  };
  refunds: Array<Record<string, unknown>>;
  exceptions: Array<Record<string, unknown>>;
  sourceSummary: Array<{ source: string; orderCount: number; grossSales: number }>;
  generatedAt: string;
};

function addHeaderRow(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers);
  row.font = { bold: true };
}

function autoWidth(sheet: ExcelJS.Worksheet, min = 10, max = 40) {
  sheet.columns.forEach((col) => {
    let width = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length + 2;
      if (len > width) width = Math.min(max, len);
    });
    col.width = width;
  });
}

/** Build an immutable accountant pack workbook from a snapshot payload. */
export async function buildXlsxBuffer(payload: GstPackPayload): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aarla OS";
  wb.created = new Date(payload.generatedAt);

  const summary = wb.addWorksheet("Summary");
  summary.addRow(["Aarla OS — GST Accountant Pack"]);
  summary.addRow(["Not GST filing software — preparation pack only."]);
  summary.addRow([]);
  summary.addRow(["Financial year", payload.period.financialYear]);
  summary.addRow(["Month", payload.period.month]);
  summary.addRow(["Period status", payload.period.status]);
  summary.addRow(["Generated at", payload.generatedAt]);
  summary.addRow([]);
  summary.addRow(["Legal name", payload.settings.legalName]);
  summary.addRow(["GSTIN", payload.settings.gstin]);
  summary.addRow(["State", payload.settings.state]);
  summary.addRow(["Accountant", payload.settings.accountantName]);
  summary.addRow(["Accountant email", payload.settings.accountantEmail]);
  summary.addRow([]);
  summary.addRow(["Sales orders", payload.sales.totals.orderCount]);
  summary.addRow(["Gross sales", payload.sales.totals.grossSales]);
  summary.addRow(["Taxable sales", payload.sales.totals.taxableSales]);
  summary.addRow(["CGST (sales)", payload.sales.totals.cgst]);
  summary.addRow(["SGST (sales)", payload.sales.totals.sgst]);
  summary.addRow(["IGST (sales)", payload.sales.totals.igst]);
  summary.addRow(["Refunds", payload.sales.totals.refunds]);
  summary.addRow(["Net sales", payload.sales.totals.netSales]);
  summary.addRow([]);
  summary.addRow(["Purchase bills", payload.purchases.totals.billCount]);
  summary.addRow(["Taxable purchases", payload.purchases.totals.taxablePurchases]);
  summary.addRow(["Captured purchase tax", payload.purchases.totals.capturedPurchaseTax]);
  summary.addRow(["Exceptions", payload.exceptions.length]);
  autoWidth(summary);

  const sales = wb.addWorksheet("Sales");
  addHeaderRow(sales, [
    "Order number",
    "Order date",
    "Customer",
    "State",
    "GSTIN",
    "B2B",
    "Qty",
    "Gross",
    "Discount",
    "Taxable",
    "CGST",
    "SGST",
    "IGST",
    "Shipping",
    "Shipping tax",
    "Refunds",
    "Net",
    "Currency",
    "Source",
    "Tax complete",
  ]);
  for (const row of payload.sales.rows) {
    sales.addRow([
      row.orderNumber,
      row.orderDate,
      row.customerName,
      row.customerState,
      row.customerGstin,
      row.b2b,
      row.quantity,
      row.grossValue,
      row.discount,
      row.taxableValue,
      row.cgst,
      row.sgst,
      row.igst,
      row.shipping,
      row.shippingTax,
      row.refunds,
      row.netValue,
      row.currency,
      row.source,
      row.taxComplete,
    ]);
  }
  autoWidth(sales);

  const purchases = wb.addWorksheet("Purchases");
  addHeaderRow(purchases, [
    "Vendor",
    "Vendor GSTIN",
    "Invoice number",
    "Invoice date",
    "Taxable",
    "CGST",
    "SGST",
    "IGST",
    "Cess",
    "Total tax",
    "Invoice total",
    "Source",
    "Review status",
    "Notes",
  ]);
  for (const bill of payload.purchases.bills) {
    purchases.addRow([
      bill.vendorName,
      bill.vendorGstin,
      bill.invoiceNumber,
      bill.invoiceDate,
      bill.taxableValue,
      bill.cgst,
      bill.sgst,
      bill.igst,
      bill.cess,
      bill.totalTax,
      bill.invoiceTotal,
      bill.source,
      bill.reviewStatus,
      bill.notes,
    ]);
  }
  autoWidth(purchases);

  const refunds = wb.addWorksheet("Refunds / Credits");
  addHeaderRow(refunds, [
    "Order number",
    "Order date",
    "Customer",
    "Refund amount",
    "Gross",
    "Net",
    "Source",
  ]);
  for (const row of payload.refunds) {
    refunds.addRow([
      row.orderNumber,
      row.orderDate,
      row.customerName,
      row.refunds,
      row.grossValue,
      row.netValue,
      row.source,
    ]);
  }
  autoWidth(refunds);

  const exceptions = wb.addWorksheet("Exceptions");
  addHeaderRow(exceptions, [
    "Code",
    "Severity",
    "Message",
    "Entity type",
    "Entity id",
    "Action hint",
  ]);
  for (const ex of payload.exceptions) {
    exceptions.addRow([
      ex.code,
      ex.severity,
      ex.message,
      ex.entityType,
      ex.entityId,
      ex.actionHint,
    ]);
  }
  autoWidth(exceptions);

  const sources = wb.addWorksheet("Source Summary");
  addHeaderRow(sources, ["Source", "Order count", "Gross sales"]);
  for (const s of payload.sourceSummary) {
    sources.addRow([s.source, s.orderCount, s.grossSales]);
  }
  autoWidth(sources);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
