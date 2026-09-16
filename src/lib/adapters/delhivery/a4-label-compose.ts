/**
 * Compose Delhivery shipping-label PDFs onto A4 sheets — 2 labels per page
 * (stacked top/bottom), ready for office printers.
 */

import { PDFDocument, degrees } from "pdf-lib";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 18;
const GAP = 12;

export async function composeDelhiveryLabelsOnA4(
  labelPdfs: Uint8Array[],
): Promise<Uint8Array> {
  if (!labelPdfs.length) {
    throw new Error("No Delhivery labels to compose.");
  }

  const out = await PDFDocument.create();
  const slotHeight = (A4_HEIGHT - MARGIN * 2 - GAP) / 2;
  const slotWidth = A4_WIDTH - MARGIN * 2;

  for (let i = 0; i < labelPdfs.length; i += 2) {
    const page = out.addPage([A4_WIDTH, A4_HEIGHT]);
    const pair = [labelPdfs[i]!, labelPdfs[i + 1]].filter(Boolean) as Uint8Array[];

    for (let slot = 0; slot < pair.length; slot++) {
      const src = await PDFDocument.load(pair[slot]!);
      const srcPage = src.getPage(0);
      const { width: srcW, height: srcH } = srcPage.getSize();
      const [embedded] = await out.embedPdf(src, [0]);

      // Fit label into half-A4 slot, preserving aspect ratio.
      const scale = Math.min(slotWidth / srcW, slotHeight / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const x = MARGIN + (slotWidth - drawW) / 2;
      // slot 0 = top, slot 1 = bottom
      const topY = A4_HEIGHT - MARGIN - slot * (slotHeight + GAP);
      const y = topY - drawH - (slotHeight - drawH) / 2;

      page.drawPage(embedded, {
        x,
        y,
        width: drawW,
        height: drawH,
        rotate: degrees(0),
      });
    }
  }

  return out.save();
}
