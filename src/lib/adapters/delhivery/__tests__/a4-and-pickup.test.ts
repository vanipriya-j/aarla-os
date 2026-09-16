import { describe, expect, it } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { composeDelhiveryLabelsOnA4 } from "@/lib/adapters/delhivery/a4-label-compose";
import { FixtureDelhiveryShippingConnector } from "@/lib/adapters/delhivery/fixture-shipping-connector";

async function tinyLabelPdf(label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Rough 4×6" thermal label size in points
  const page = doc.addPage([288, 432]);
  page.drawText(label, { x: 24, y: 400, size: 18, color: rgb(0, 0, 0) });
  return doc.save();
}

describe("composeDelhiveryLabelsOnA4", () => {
  it("places two labels per A4 page", async () => {
    const labels = await Promise.all([
      tinyLabelPdf("A"),
      tinyLabelPdf("B"),
      tinyLabelPdf("C"),
    ]);
    const out = await composeDelhiveryLabelsOnA4(labels);
    const composed = await PDFDocument.load(out);
    // 3 labels → 2 pages (2 + 1)
    expect(composed.getPageCount()).toBe(2);
    const size = composed.getPage(0).getSize();
    expect(Math.round(size.width)).toBe(595);
    expect(Math.round(size.height)).toBe(842);
  });
});

describe("FixtureDelhiveryShippingConnector.schedulePickup", () => {
  it("returns a fixture pickup id", async () => {
    const c = new FixtureDelhiveryShippingConnector();
    const r = await c.schedulePickup({
      pickupDate: "2026-09-16",
      pickupTime: "18:00:00",
      expectedPackageCount: 4,
      pickupLocation: "Aarla Studio",
    });
    expect(r.pickupId).toContain("FIX-PU");
    expect(r.expectedPackageCount).toBe(4);
  });
});
