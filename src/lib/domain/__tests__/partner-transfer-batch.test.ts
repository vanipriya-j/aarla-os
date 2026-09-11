import { describe, expect, it } from "vitest";
import {
  buildPartnerStockBatchReference,
  buildPartnerStockBatchShareText,
  isPartnerStockBatchReference,
  summarizePartnerStockBatch,
} from "@/lib/domain/partner-transfer-batch";

describe("partner-transfer-batch", () => {
  it("builds a shared TR-BATCH reference for studio transfers", () => {
    const ref = buildPartnerStockBatchReference(
      "transfer",
      "partner-freshly",
      new Date("2026-09-11T10:00:00.000Z"),
    );
    expect(ref.startsWith("TR-BATCH-FRESHLY-20260911-")).toBe(true);
    expect(isPartnerStockBatchReference(ref)).toBe(true);
  });

  it("builds consolidated share text for the partner", () => {
    const text = buildPartnerStockBatchShareText({
      kind: "transfer",
      partnerName: "Freshly Brewed",
      reference: "TR-BATCH-FRESHLY-20260911-abc",
      notes: "Morning drop",
      lines: [
        { productTitle: "Kolam Bottle", variantLabel: "Blue", quantity: 4 },
        { productTitle: "Mini Tote", variantLabel: "Maroon", quantity: 10 },
      ],
    });
    expect(text).toContain("Aarla stock transfer to Freshly Brewed");
    expect(text).toContain("Batch: TR-BATCH-FRESHLY-20260911-abc");
    expect(text).toContain("1. Kolam Bottle · Blue × 4");
    expect(text).toContain("2. Mini Tote · Maroon × 10");
    expect(text).toContain("Total units: 14");
    expect(text).toContain("Notes: Morning drop");
  });

  it("summarizes a batch with total units and share text", () => {
    const summary = summarizePartnerStockBatch({
      kind: "transfer",
      partnerId: "partner-freshly",
      partnerName: "Freshly Brewed",
      reference: "TR-BATCH-1",
      lines: [
        {
          productId: "p1",
          variantId: "v1",
          productTitle: "Kolam Bottle",
          variantLabel: "Blue",
          quantity: 4,
        },
        {
          productId: "p2",
          variantId: "v2",
          productTitle: "Mini Tote",
          variantLabel: "Maroon",
          quantity: 6,
        },
      ],
    });
    expect(summary.totalUnits).toBe(10);
    expect(summary.shareText).toContain("Total units: 10");
  });
});
