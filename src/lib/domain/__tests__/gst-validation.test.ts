import { describe, expect, it } from "vitest";
import {
  aggregateTaxLines,
  approxEqual,
  bucketTaxLineTitle,
  financialYearForDate,
  invoiceArithmeticOk,
  isLikelyDuplicateBill,
  periodBounds,
  purchaseBillDuplicateKey,
  sumTax,
  totalTaxBreakdownOk,
} from "@/lib/domain/gst-validation";

describe("approxEqual / sumTax / invoiceArithmeticOk", () => {
  it("tolerates ±₹1", () => {
    expect(approxEqual(100, 100.5)).toBe(true);
    expect(approxEqual(100, 101)).toBe(true);
    expect(approxEqual(100, 101.01)).toBe(false);
  });

  it("sums tax components", () => {
    expect(sumTax({ cgst: 9, sgst: 9, igst: 0, cess: 1 })).toBe(19);
  });

  it("checks taxable + tax ≈ invoice total", () => {
    expect(
      invoiceArithmeticOk({
        taxableValue: 1000,
        cgst: 90,
        sgst: 90,
        igst: 0,
        invoiceTotal: 1180,
      }),
    ).toBe(true);
    expect(
      invoiceArithmeticOk({
        taxableValue: 1000,
        cgst: 90,
        sgst: 90,
        igst: 0,
        invoiceTotal: 1200,
      }),
    ).toBe(false);
  });
});

describe("totalTaxBreakdownOk", () => {
  it("accepts CGST+SGST path", () => {
    expect(
      totalTaxBreakdownOk({ cgst: 90, sgst: 90, igst: 0, totalTax: 180 }),
    ).toBe(true);
  });

  it("accepts IGST path", () => {
    expect(
      totalTaxBreakdownOk({ cgst: 0, sgst: 0, igst: 180, totalTax: 180 }),
    ).toBe(true);
  });

  it("rejects mixed or mismatched totals", () => {
    expect(
      totalTaxBreakdownOk({ cgst: 90, sgst: 90, igst: 0, totalTax: 200 }),
    ).toBe(false);
  });
});

describe("tax line bucketing", () => {
  it("maps titles to CGST / SGST / IGST", () => {
    expect(bucketTaxLineTitle("CGST 9%")).toBe("cgst");
    expect(bucketTaxLineTitle("SGST")).toBe("sgst");
    expect(bucketTaxLineTitle("UTGST")).toBe("sgst");
    expect(bucketTaxLineTitle("IGST 18%")).toBe("igst");
    expect(bucketTaxLineTitle("VAT")).toBe("other");
  });

  it("aggregates tax lines without inventing amounts", () => {
    const agg = aggregateTaxLines([
      { title: "CGST", price: 45 },
      { title: "SGST", price: 45 },
      { title: "IGST", price: 0 },
      { title: "Other fee", price: 5 },
    ]);
    expect(agg).toEqual({ cgst: 45, sgst: 45, igst: 0, other: 5, total: 95 });
  });
});

describe("financialYearForDate / periodBounds", () => {
  it("uses April FY start by default", () => {
    expect(financialYearForDate(new Date("2025-05-10T00:00:00.000Z"))).toEqual({
      financialYear: "2025-26",
      month: 5,
    });
    expect(financialYearForDate(new Date("2026-02-01T00:00:00.000Z"))).toEqual({
      financialYear: "2025-26",
      month: 2,
    });
  });

  it("builds IST month bounds as exclusive-end ISO", () => {
    const bounds = periodBounds("2025-26", 4);
    // 2025-04-01 00:00 IST = 2025-03-31 18:30 UTC
    expect(bounds.startIso).toBe("2025-03-31T18:30:00.000Z");
    // 2025-05-01 00:00 IST
    expect(bounds.endExclusiveIso).toBe("2025-04-30T18:30:00.000Z");
  });

  it("rolls Jan–Mar into the next calendar year within FY", () => {
    const bounds = periodBounds("2025-26", 1);
    expect(bounds.startIso).toBe("2025-12-31T18:30:00.000Z");
    expect(bounds.endExclusiveIso).toBe("2026-01-31T18:30:00.000Z");
  });
});

describe("duplicate purchase bills", () => {
  it("keys by GSTIN when present", () => {
    const a = purchaseBillDuplicateKey({
      vendorGstin: "29AAAAA0000A1Z5",
      vendorName: "Acme",
      invoiceNumber: "INV-1",
      invoiceDate: "2026-04-01",
      invoiceTotal: 1180,
    });
    const b = purchaseBillDuplicateKey({
      vendorGstin: "29aaaaa0000a1z5",
      vendorName: "Different Name",
      invoiceNumber: "inv-1",
      invoiceDate: "2026-04-01",
      invoiceTotal: 1180.4,
    });
    expect(isLikelyDuplicateBill(a, b)).toBe(true);
  });

  it("rejects different invoice totals beyond tolerance", () => {
    const a = purchaseBillDuplicateKey({
      vendorName: "Acme",
      invoiceNumber: "INV-1",
      invoiceDate: null,
      invoiceTotal: 100,
    });
    const b = purchaseBillDuplicateKey({
      vendorName: "Acme",
      invoiceNumber: "INV-1",
      invoiceDate: null,
      invoiceTotal: 120,
    });
    expect(isLikelyDuplicateBill(a, b)).toBe(false);
  });
});
