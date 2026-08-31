/**
 * VendorOrderDocumentService — visual PDF generation + versioning.
 */
import "server-only";
import PDFDocument from "pdfkit";
import type { VendorOrder, MfgVendorProfile } from "@/lib/domain/manufacture-types";
import {
  getLatestPdfVersion,
  getMfgVendor,
  getVendorOrder,
  savePdfVersion,
} from "@/lib/infra/repositories/postgres-manufacture";

function formatINR(n: number | null | undefined): string {
  if (n == null) return "PRICE PENDING";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export async function buildVendorOrderPdfBuffer(input: {
  order: VendorOrder;
  vendor: MfgVendorProfile;
  versionNumber: number;
}): Promise<Buffer> {
  const { order, vendor, versionNumber } = input;
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Header
  doc.fillColor("#1B2A4A").fontSize(22).text("Aarla", { continued: false });
  doc.fillColor("#C45C26").fontSize(10).text("OS · Manufacturing order", { continued: false });
  doc.moveDown(0.5);
  doc.fillColor("#1B2A4A").fontSize(16).text(order.orderNumber);
  doc.fontSize(9).fillColor("#555555").text(
    `PDF Version ${versionNumber} · Generated ${new Date().toLocaleString("en-IN")}`,
  );
  doc.moveDown();

  doc.fillColor("#1B2A4A").fontSize(11).text("Vendor");
  doc.fontSize(10).fillColor("#333333");
  doc.text(vendor.businessName || vendor.name);
  if (vendor.contactPerson) doc.text(`Contact: ${vendor.contactPerson}`);
  if (vendor.whatsappNumber || vendor.phone) {
    doc.text(`WhatsApp / phone: ${vendor.whatsappNumber || vendor.phone}`);
  }
  if (vendor.email) doc.text(`Email: ${vendor.email}`);
  doc.moveDown(0.5);

  doc.fillColor("#1B2A4A").fontSize(11).text("Dates");
  doc.fontSize(10).fillColor("#333333");
  doc.text(`Order date: ${order.orderDate}`);
  doc.text(`Requested delivery: ${order.requestedDeliveryDate ?? "—"}`);
  if (order.vendorCommittedDate) {
    doc.text(`Vendor committed: ${order.vendorCommittedDate}`);
  }
  // Internal expected date intentionally omitted from vendor PDF
  doc.moveDown();

  doc.fillColor("#1B2A4A").fontSize(11).text("Line items");
  doc.moveDown(0.3);

  for (const item of order.items) {
    doc.fillColor("#1B2A4A").fontSize(11).text(item.title || item.productId);
    doc.fillColor("#333333").fontSize(9);
    const bits = [
      item.variantLabel,
      item.colour && `Colour: ${item.colour}`,
      item.sizeLabel && `Size: ${item.sizeLabel}`,
      item.sku && `SKU: ${item.sku}`,
    ].filter(Boolean);
    if (bits.length) doc.text(bits.join(" · "));
    doc.text(`Quantity: ${item.quantity}`);
    doc.text(
      `Unit: ${item.unitCost == null ? "PRICE PENDING" : formatINR(item.unitCost)} · Line: ${
        item.lineTotal == null ? "PRICE PENDING" : formatINR(item.lineTotal)
      }`,
    );
    if (item.customisationInstructions) {
      doc.text(`Customisation: ${item.customisationInstructions}`);
    }
    if (item.finishInstructions) doc.text(`Finish: ${item.finishInstructions}`);
    if (item.artworkReference) doc.text(`Artwork: ${item.artworkReference}`);
    if (item.notes) doc.text(`Notes: ${item.notes}`);
    doc.moveDown(0.6);
  }

  doc.fillColor("#1B2A4A").fontSize(11).text("Totals & payment");
  doc.fillColor("#333333").fontSize(10);
  doc.text(`Pricing: ${order.pricingStatus === "pending" ? "PRICE PENDING" : "Confirmed"}`);
  doc.text(`Subtotal / Total: ${formatINR(order.total ?? order.subtotal)}`);
  if (order.advancePercentage != null) {
    doc.text(
      `Advance (${order.advancePercentage}%): ${formatINR(order.advanceAmount)}`,
    );
  }
  if (order.balanceAmount != null) {
    doc.text(`Balance: ${formatINR(order.balanceAmount)}`);
  }
  if (vendor.paymentTerms) doc.text(`Payment terms: ${vendor.paymentTerms}`);
  doc.text(`Deliver to: ${order.deliveryLocation}`);
  if (order.notes) {
    doc.moveDown(0.3);
    doc.text(`Order notes: ${order.notes}`);
  }

  doc.moveDown();
  doc.fillColor("#1B2A4A").fontSize(11).text("PLEASE CONFIRM");
  doc.fillColor("#333333").fontSize(10);
  doc.text("• Quantities");
  doc.text("• Pricing");
  doc.text("• Committed delivery date");
  doc.text("• Any material / design constraints");
  doc.moveDown();
  doc.fontSize(8).fillColor("#888888").text(
    "Inventory is updated only after Aarla receives and accepts stock — not when production is marked done.",
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
  const latest = await getLatestPdfVersion(orderNumber);
  const nextVersion = (latest?.versionNumber ?? 0) + 1;
  const bytes = await buildVendorOrderPdfBuffer({
    order,
    vendor,
    versionNumber: nextVersion,
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
