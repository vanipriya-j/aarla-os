/**
 * VendorOrderDocumentService — visual PDF generation + versioning.
 * Formats as a purchase-order style table and embeds image attachments.
 */
import "server-only";
import PDFDocument from "pdfkit";
import type { VendorOrder, MfgVendorProfile, VendorOrderItem } from "@/lib/domain/manufacture-types";
import {
  getLatestPdfVersion,
  getMfgVendor,
  getVendorOrder,
  listVendorOrderAttachmentContents,
  savePdfVersion,
} from "@/lib/infra/repositories/postgres-manufacture";

type AttachmentBytes = Awaited<ReturnType<typeof listVendorOrderAttachmentContents>>[number];

function formatRate(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "NA";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatINR(n: number | null | undefined): string {
  if (n == null) return "NA";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function isEmbeddableImage(mimeType: string, filename: string): boolean {
  const mime = mimeType.toLowerCase();
  if (mime.includes("png") || mime.includes("jpeg") || mime.includes("jpg")) return true;
  const lower = filename.toLowerCase();
  return /\.(png|jpe?g)$/i.test(lower);
}

function itemDescription(item: VendorOrderItem): string {
  const lines: string[] = [item.title || item.productId];
  if (item.isCustom) lines.push("Custom item (not in catalog)");
  const meta = [
    item.variantLabel,
    item.colour && `Colour: ${item.colour}`,
    item.sizeLabel && `Size: ${item.sizeLabel}`,
    item.sku && `SKU: ${item.sku}`,
  ].filter(Boolean);
  if (meta.length) lines.push(meta.join(" · "));
  if (item.description) lines.push(item.description);
  if (item.customisationInstructions) lines.push(`Customisation: ${item.customisationInstructions}`);
  if (item.finishInstructions) lines.push(`Finish: ${item.finishInstructions}`);
  if (item.notes && item.notes !== item.description) lines.push(`Notes: ${item.notes}`);
  return lines.join("\n");
}

export async function buildVendorOrderPdfBuffer(input: {
  order: VendorOrder;
  vendor: MfgVendorProfile;
  versionNumber: number;
  attachments?: AttachmentBytes[];
}): Promise<Buffer> {
  const { order, vendor, versionNumber } = input;
  const attachments = input.attachments ?? [];
  const byItem = new Map<string, AttachmentBytes[]>();
  for (const a of attachments) {
    const list = byItem.get(a.itemId) ?? [];
    list.push(a);
    byItem.set(a.itemId, list);
  }

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width;
  const left = 48;
  const right = pageWidth - 48;
  const usable = right - left;

  // Column layout: S.No | Item Description | Qty | Rate
  const col = {
    sno: left,
    item: left + 36,
    qty: left + usable - 130,
    rate: left + usable - 70,
  };
  const widths = {
    sno: 32,
    item: col.qty - col.item - 8,
    qty: 52,
    rate: 70,
  };

  // Header
  doc.fillColor("#1B2A4A").fontSize(20).text("Aarla", left, 48, { continued: false });
  doc.fillColor("#C45C26").fontSize(10).text("Purchase Order", left, 72);
  doc.fillColor("#1B2A4A").fontSize(14).text(order.orderNumber, left, 92);
  doc
    .fontSize(8)
    .fillColor("#666666")
    .text(
      `PDF v${versionNumber} · ${new Date().toLocaleString("en-IN")}`,
      left,
      112,
    );

  let y = 136;
  doc.fillColor("#1B2A4A").fontSize(10).text("Vendor", left, y);
  y += 14;
  doc.fillColor("#333333").fontSize(9);
  doc.text(vendor.businessName || vendor.name, left, y);
  y += 12;
  if (vendor.contactPerson) {
    doc.text(`Contact: ${vendor.contactPerson}`, left, y);
    y += 12;
  }
  if (vendor.whatsappNumber || vendor.phone) {
    doc.text(`WhatsApp / phone: ${vendor.whatsappNumber || vendor.phone}`, left, y);
    y += 12;
  }
  y += 6;
  doc.fillColor("#1B2A4A").fontSize(10).text("Dates", left, y);
  y += 14;
  doc.fillColor("#333333").fontSize(9);
  doc.text(`Order date: ${order.orderDate}`, left, y);
  y += 12;
  doc.text(`Requested delivery: ${order.requestedDeliveryDate ?? "—"}`, left, y);
  y += 12;
  if (order.vendorCommittedDate) {
    doc.text(`Vendor committed: ${order.vendorCommittedDate}`, left, y);
    y += 12;
  }
  y += 14;

  function ensureSpace(needed: number) {
    const bottom = doc.page.height - 48;
    if (y + needed > bottom) {
      doc.addPage();
      y = 48;
      drawTableHeader();
    }
  }

  function drawTableHeader() {
    const h = 22;
    doc.rect(left, y, usable, h).fill("#1B2A4A");
    doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
    doc.text("S.No", col.sno + 4, y + 7, { width: widths.sno });
    doc.text("Item Description", col.item + 4, y + 7, { width: widths.item });
    doc.text("Qty", col.qty + 4, y + 7, { width: widths.qty, align: "right" });
    doc.text("Rate", col.rate + 4, y + 7, { width: widths.rate, align: "right" });
    doc.font("Helvetica");
    y += h;
  }

  drawTableHeader();

  order.items.forEach((item, index) => {
    const desc = itemDescription(item);
    const descHeight = Math.max(
      28,
      doc.heightOfString(desc, { width: widths.item - 8, align: "left" }) + 12,
    );
    const files = byItem.get(item.id) ?? [];
    const imageFiles = files.filter((f) => isEmbeddableImage(f.mimeType, f.filename));
    const otherFiles = files.filter((f) => !isEmbeddableImage(f.mimeType, f.filename));
    const imageBlock = imageFiles.length > 0 ? 8 + Math.ceil(imageFiles.length / 2) * 118 : 0;
    const otherBlock = otherFiles.length
      ? 14 + otherFiles.length * 11
      : 0;
    ensureSpace(descHeight + imageBlock + otherBlock + 8);

    // Row background stripe
    if (index % 2 === 1) {
      doc.rect(left, y, usable, descHeight).fill("#F7F5F1");
    }
    doc
      .strokeColor("#DDDDDD")
      .lineWidth(0.5)
      .moveTo(left, y)
      .lineTo(right, y)
      .stroke();

    const textY = y + 6;
    doc.fillColor("#1B2A4A").fontSize(9);
    doc.text(String(index + 1), col.sno + 4, textY, { width: widths.sno });
    doc.fillColor("#222222").fontSize(9);
    doc.text(desc, col.item + 4, textY, { width: widths.item - 8 });
    doc.text(String(item.quantity), col.qty + 4, textY, {
      width: widths.qty - 8,
      align: "right",
    });
    doc.text(formatRate(item.unitCost), col.rate + 4, textY, {
      width: widths.rate - 8,
      align: "right",
    });

    y += descHeight;

    // Embed image / design previews
    if (imageFiles.length) {
      doc.fillColor("#555555").fontSize(8).text("Attachments", col.item + 4, y);
      y += 12;
      let x = col.item + 4;
      let rowStartY = y;
      let maxRowH = 0;
      for (const file of imageFiles) {
        const boxW = 160;
        const boxH = 110;
        if (x + boxW > right) {
          x = col.item + 4;
          y = rowStartY + maxRowH + 8;
          rowStartY = y;
          maxRowH = 0;
          ensureSpace(boxH + 20);
        }
        ensureSpace(boxH + 20);
        try {
          doc.image(file.bytes, x, y, { fit: [boxW, boxH - 14], align: "center", valign: "center" });
          doc
            .fillColor("#666666")
            .fontSize(7)
            .text(file.filename, x, y + boxH - 12, { width: boxW, ellipsis: true });
          maxRowH = Math.max(maxRowH, boxH);
          x += boxW + 10;
        } catch {
          doc
            .fillColor("#888888")
            .fontSize(8)
            .text(`${file.filename} (could not preview)`, x, y, { width: boxW });
          maxRowH = Math.max(maxRowH, 20);
          x += boxW + 10;
        }
      }
      y = rowStartY + maxRowH + 6;
    }

    if (otherFiles.length) {
      ensureSpace(16 + otherFiles.length * 11);
      doc.fillColor("#555555").fontSize(8).text("Design files (download from Aarla OS):", col.item + 4, y);
      y += 12;
      for (const file of otherFiles) {
        doc
          .fillColor("#333333")
          .fontSize(8)
          .text(`• ${file.filename}`, col.item + 4, y, { width: widths.item });
        y += 11;
      }
      y += 4;
    }

    doc
      .strokeColor("#DDDDDD")
      .lineWidth(0.5)
      .moveTo(left, y)
      .lineTo(right, y)
      .stroke();
  });

  y += 16;
  ensureSpace(120);
  doc.fillColor("#1B2A4A").fontSize(11).text("Totals & payment", left, y);
  y += 16;
  doc.fillColor("#333333").fontSize(9);
  doc.text(`Subtotal / Total: ${formatINR(order.total ?? order.subtotal)}`, left, y);
  y += 12;
  if (order.advancePercentage != null) {
    doc.text(
      `Advance (${order.advancePercentage}%): ${formatINR(order.advanceAmount)}`,
      left,
      y,
    );
    y += 12;
  }
  if (order.balanceAmount != null) {
    doc.text(`Balance: ${formatINR(order.balanceAmount)}`, left, y);
    y += 12;
  }
  if (vendor.paymentTerms) {
    doc.text(`Payment terms: ${vendor.paymentTerms}`, left, y);
    y += 12;
  }
  doc.text(`Deliver to: ${order.deliveryLocation}`, left, y);
  y += 12;
  if (order.notes) {
    doc.text(`Order notes: ${order.notes}`, left, y, { width: usable });
    y += 16;
  }

  y += 8;
  ensureSpace(90);
  doc.fillColor("#1B2A4A").fontSize(11).text("PLEASE CONFIRM", left, y);
  y += 14;
  doc.fillColor("#333333").fontSize(9);
  for (const line of [
    "• Quantities",
    "• Pricing",
    "• Committed delivery date",
    "• Any material / design constraints",
  ]) {
    doc.text(line, left, y);
    y += 12;
  }
  y += 8;
  doc
    .fontSize(8)
    .fillColor("#888888")
    .text(
      "Inventory is updated only after Aarla receives and accepts stock — not when production is marked done.",
      left,
      y,
      { width: usable },
    );

  doc.end();
  return done;
}

export async function generateVendorOrderPdf(orderNumber: string): Promise<{
  version: Awaited<ReturnType<typeof savePdfVersion>>;
  bytes: Buffer;
}> {
  const order = await getVendorOrder(orderNumber);
  if (!order) throw new Error("Vendor order not found");
  const vendor = await getMfgVendor(order.vendorId);
  if (!vendor) throw new Error("Vendor not found");
  const attachments = await listVendorOrderAttachmentContents(orderNumber);
  const latest = await getLatestPdfVersion(orderNumber);
  const nextVersion = (latest?.versionNumber ?? 0) + 1;
  const bytes = await buildVendorOrderPdfBuffer({
    order,
    vendor,
    versionNumber: nextVersion,
    attachments,
  });
  const version = await savePdfVersion({
    orderNumber,
    bytes,
    snapshot: { order, vendor, versionNumber: nextVersion },
  });
  return { version, bytes };
}

export async function getLatestVendorOrderPdf(orderNumber: string) {
  return getLatestPdfVersion(orderNumber);
}
