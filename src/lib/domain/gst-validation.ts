/**
 * Deterministic GST arithmetic helpers for reconciliation.
 * No tax advice — validation only.
 */

export const GST_AMOUNT_TOLERANCE = 1; // ₹1

export function approxEqual(
  a: number,
  b: number,
  tolerance = GST_AMOUNT_TOLERANCE,
): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tolerance;
}

export function sumTax(parts: {
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  cess?: number | null;
}): number {
  return (
    Number(parts.cgst ?? 0) +
    Number(parts.sgst ?? 0) +
    Number(parts.igst ?? 0) +
    Number(parts.cess ?? 0)
  );
}

/** Taxable + GST components ≈ invoice total */
export function invoiceArithmeticOk(input: {
  taxableValue: number;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  cess?: number | null;
  invoiceTotal: number;
}): boolean {
  const expected = Number(input.taxableValue) + sumTax(input);
  return approxEqual(expected, Number(input.invoiceTotal));
}

/** CGST+SGST ≈ totalTax (intra-state) OR IGST ≈ totalTax (inter-state) */
export function totalTaxBreakdownOk(input: {
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  cess?: number | null;
  totalTax: number;
}): boolean {
  const cgst = Number(input.cgst ?? 0);
  const sgst = Number(input.sgst ?? 0);
  const igst = Number(input.igst ?? 0);
  const cess = Number(input.cess ?? 0);
  const total = Number(input.totalTax);
  if (igst > 0 && cgst === 0 && sgst === 0) {
    return approxEqual(igst + cess, total);
  }
  if (cgst > 0 || sgst > 0) {
    return approxEqual(cgst + sgst + cess, total);
  }
  // All zero — only ok if totalTax is also ~0
  return approxEqual(cess, total);
}

export type TaxLineBucket = "cgst" | "sgst" | "igst" | "other";

/** Map Shopify tax line titles to Indian GST buckets — never invent amounts. */
export function bucketTaxLineTitle(title: string | null | undefined): TaxLineBucket {
  const t = (title ?? "").toUpperCase();
  if (t.includes("IGST")) return "igst";
  if (t.includes("CGST")) return "cgst";
  if (t.includes("SGST") || t.includes("UTGST")) return "sgst";
  return "other";
}

export function aggregateTaxLines(
  lines: Array<{ title?: string | null; price: number }>,
): { cgst: number; sgst: number; igst: number; other: number; total: number } {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let other = 0;
  for (const line of lines) {
    const amount = Number(line.price) || 0;
    switch (bucketTaxLineTitle(line.title)) {
      case "cgst":
        cgst += amount;
        break;
      case "sgst":
        sgst += amount;
        break;
      case "igst":
        igst += amount;
        break;
      default:
        other += amount;
    }
  }
  return { cgst, sgst, igst, other, total: cgst + sgst + igst + other };
}

/** Indian FY label from a calendar date and FY start month (default April = 4). */
export function financialYearForDate(
  date: Date,
  fyStartMonth = 4,
): { financialYear: string; month: number } {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const fyStartYear = month >= fyStartMonth ? year : year - 1;
  const fyEndYearShort = String(fyStartYear + 1).slice(-2);
  return {
    financialYear: `${fyStartYear}-${fyEndYearShort}`,
    month,
  };
}

export function periodBounds(
  financialYear: string,
  month: number,
  fyStartMonth = 4,
): { startIso: string; endExclusiveIso: string } {
  const startYear = Number(financialYear.split("-")[0]);
  if (!Number.isFinite(startYear) || month < 1 || month > 12) {
    throw new Error("Invalid financial year or month.");
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  // FY 2025-26 (start Apr): Apr–Dec → 2025, Jan–Mar → 2026
  const calendarYear = month >= fyStartMonth ? startYear : startYear + 1;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endCalYear = nextMonth === 1 ? calendarYear + 1 : calendarYear;
  const start = `${calendarYear}-${pad(month)}-01T00:00:00+05:30`;
  const end = `${endCalYear}-${pad(nextMonth)}-01T00:00:00+05:30`;
  return {
    startIso: new Date(start).toISOString(),
    endExclusiveIso: new Date(end).toISOString(),
  };
}

export type DuplicateBillKey = {
  vendorKey: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceTotal: number;
};

export function purchaseBillDuplicateKey(input: {
  vendorGstin?: string | null;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceTotal: number;
}): DuplicateBillKey {
  const gstin = input.vendorGstin?.trim().toUpperCase();
  const vendorKey = gstin || input.vendorName.trim().toLowerCase() || "(unknown)";
  return {
    vendorKey,
    invoiceNumber: input.invoiceNumber.trim().toLowerCase(),
    invoiceDate: input.invoiceDate,
    invoiceTotal: Math.round(Number(input.invoiceTotal) * 100) / 100,
  };
}

export function isLikelyDuplicateBill(a: DuplicateBillKey, b: DuplicateBillKey): boolean {
  if (!a.invoiceNumber || !b.invoiceNumber) return false;
  if (a.vendorKey !== b.vendorKey) return false;
  if (a.invoiceNumber !== b.invoiceNumber) return false;
  if (a.invoiceDate && b.invoiceDate && a.invoiceDate !== b.invoiceDate) return false;
  return approxEqual(a.invoiceTotal, b.invoiceTotal);
}
