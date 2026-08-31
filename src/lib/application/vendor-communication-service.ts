/**
 * VendorCommunicationService — WhatsApp manual send + channel abstraction.
 */
import "server-only";
import type { VendorOrder } from "@/lib/domain/manufacture-types";
import {
  getMfgVendor,
  getVendorOrder,
  logCommunication,
  updateVendorOrderStatus,
} from "@/lib/infra/repositories/postgres-manufacture";
import {
  generateVendorOrderPdf,
  getLatestVendorOrderPdf,
} from "@/lib/application/vendor-order-document-service";
import {
  buildWhatsAppDeepLink,
  prepareWhatsAppMessage,
} from "@/lib/application/vendor-communication";

export {
  buildWhatsAppDeepLink,
  prepareWhatsAppMessage,
} from "@/lib/application/vendor-communication";

export async function prepareSendVendorOrder(orderNumber: string): Promise<{
  order: VendorOrder;
  vendorName: string;
  whatsappNumber: string;
  message: string;
  whatsappUrl: string;
  pdfVersionNumber: number | null;
  pdfDownloadPath: string;
}> {
  const order = await getVendorOrder(orderNumber);
  if (!order) throw new Error("Order not found");
  const vendor = await getMfgVendor(order.vendorId);
  if (!vendor) throw new Error("Vendor not found");
  let pdf = await getLatestVendorOrderPdf(orderNumber);
  if (!pdf?.hasFile) {
    const gen = await generateVendorOrderPdf(orderNumber);
    pdf = gen.version;
  }
  const message = prepareWhatsAppMessage({
    order,
    vendorName: vendor.contactPerson || vendor.name,
  });
  const phone = vendor.whatsappNumber || vendor.phone || vendor.contact;
  if (!phone) throw new Error("Vendor has no WhatsApp / phone number — add it on the vendor page.");
  return {
    order,
    vendorName: vendor.name,
    whatsappNumber: phone,
    message,
    whatsappUrl: buildWhatsAppDeepLink(phone, message),
    pdfVersionNumber: pdf?.versionNumber ?? null,
    pdfDownloadPath: `/api/manufacture/orders/${encodeURIComponent(orderNumber)}/pdf`,
  };
}

export async function initiateWhatsAppSend(orderNumber: string): Promise<{
  whatsappUrl: string;
  communicationId: string;
  message: string;
}> {
  const prepared = await prepareSendVendorOrder(orderNumber);
  const pdf = await getLatestVendorOrderPdf(orderNumber);
  const log = await logCommunication({
    orderNumber,
    channel: "WHATSAPP_MANUAL",
    direction: "OUTBOUND",
    status: "SEND_INITIATED",
    recipient: prepared.whatsappNumber,
    message: prepared.message,
    pdfVersionId: pdf?.id ?? null,
  });
  await updateVendorOrderStatus(orderNumber, "awaiting_confirmation");
  return {
    whatsappUrl: prepared.whatsappUrl,
    communicationId: log.id,
    message: prepared.message,
  };
}

export async function markVendorOrderSent(orderNumber: string): Promise<void> {
  const pdf = await getLatestVendorOrderPdf(orderNumber);
  await logCommunication({
    orderNumber,
    channel: "WHATSAPP_MANUAL",
    direction: "OUTBOUND",
    status: "SENT",
    recipient: "",
    message: "Marked sent by user after WhatsApp share",
    pdfVersionId: pdf?.id ?? null,
  });
  await updateVendorOrderStatus(orderNumber, "awaiting_confirmation");
}

/** Future API / email / download channels share this entry point. */
export async function sendVendorOrder(input: {
  orderNumber: string;
  channel: "WHATSAPP_MANUAL" | "WHATSAPP_API" | "EMAIL" | "DOWNLOAD";
}): Promise<{ ok: true; whatsappUrl?: string }> {
  if (input.channel === "WHATSAPP_MANUAL") {
    const r = await initiateWhatsAppSend(input.orderNumber);
    return { ok: true, whatsappUrl: r.whatsappUrl };
  }
  if (input.channel === "DOWNLOAD") {
    await generateVendorOrderPdf(input.orderNumber);
    return { ok: true };
  }
  throw new Error(`Channel ${input.channel} is not enabled yet`);
}
