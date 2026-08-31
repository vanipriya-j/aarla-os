"use server";

import { generateVendorWorkflow } from "@/lib/application/vendor-workflow-ai";
import {
  buildNeedsMakingBoard,
  createNeedFromInventory,
} from "@/lib/application/manufacture-needs-service";
import {
  generateVendorOrderPdf,
} from "@/lib/application/vendor-order-document-service";
import {
  initiateWhatsAppSend,
  markVendorOrderSent,
  prepareSendVendorOrder,
} from "@/lib/application/vendor-communication-service";
import {
  completeActiveWorkflowStep,
  createMfgVendor,
  createVendorOrder,
  getMfgVendor,
  getVendorOrder,
  getWorkflowInstanceForOrder,
  listCommunications,
  listMfgVendors,
  listProductionRequirements,
  listVendorOrders,
  listVendorPayments,
  listWorkflowTemplates,
  markPaymentPaid,
  recordVendorConfirmation,
  saveWorkflowTemplateFromDraft,
  syncVendorOrderToLegacyPurchaseOrders,
  updateProductionRequirementStatus,
  updateVendorHowTheyWork,
  updateVendorProfile,
  updateVendorOrderStatus,
} from "@/lib/infra/repositories/postgres-manufacture";
import type { VendorWorkflowAiDraft } from "@/lib/domain/manufacture-types";
import { listProducts } from "@/lib/application/services";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

export async function listManufactureVendorsAction() {
  try {
    return { ok: true as const, data: await listMfgVendors() };
  } catch (e) {
    return fail(e);
  }
}

export async function getManufactureVendorAction(code: string) {
  try {
    const v = await getMfgVendor(code);
    if (!v) return { ok: false as const, error: "Vendor not found" };
    return { ok: true as const, data: v };
  } catch (e) {
    return fail(e);
  }
}

export async function updateVendorHowTheyWorkAction(code: string, text: string) {
  try {
    const v = await updateVendorHowTheyWork(code, text);
    if (!v) return { ok: false as const, error: "Vendor not found" };
    return { ok: true as const, data: v };
  } catch (e) {
    return fail(e);
  }
}

export async function updateVendorProfileAction(
  code: string,
  patch: Parameters<typeof updateVendorProfile>[1],
) {
  try {
    const v = await updateVendorProfile(code, patch);
    if (!v) return { ok: false as const, error: "Vendor not found" };
    return { ok: true as const, data: v };
  } catch (e) {
    return fail(e);
  }
}

export async function generateVendorWorkflowAction(input: {
  vendorCode: string;
  description: string;
}): Promise<ActionResult<VendorWorkflowAiDraft>> {
  try {
    const vendor = await getMfgVendor(input.vendorCode);
    const draft = await generateVendorWorkflow({
      vendorDescription: input.description,
      vendorName: vendor?.name,
      categories: vendor?.categoriesSupported,
    });
    return { ok: true, data: draft };
  } catch (e) {
    return fail(e);
  }
}

export async function createManufactureVendorAction(input: {
  name: string;
  businessName?: string;
  contactPerson?: string;
  phone?: string;
  whatsappNumber?: string;
  email?: string;
  city?: string;
  whatTheyMake?: string;
  paymentTerms?: string;
  advancePercentage?: number | null;
  statedLeadTimeDays?: number | null;
  howTheyWork?: string;
}) {
  try {
    return { ok: true as const, data: await createMfgVendor(input) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveVendorWorkflowAction(input: {
  vendorCode: string;
  draft: VendorWorkflowAiDraft;
  approve: boolean;
  sourceDescription?: string;
}) {
  try {
    const tpl = await saveWorkflowTemplateFromDraft(input);
    return { ok: true as const, data: tpl };
  } catch (e) {
    return fail(e);
  }
}

export async function listWorkflowTemplatesAction() {
  try {
    return { ok: true as const, data: await listWorkflowTemplates() };
  } catch (e) {
    return fail(e);
  }
}

export async function getNeedsMakingAction() {
  try {
    return { ok: true as const, data: await buildNeedsMakingBoard() };
  } catch (e) {
    return fail(e);
  }
}

export async function createNeedAction(input: {
  productId: string;
  variantId?: string | null;
  quantity: number;
  reason: string;
  suggestedVendorCode?: string | null;
}) {
  try {
    return { ok: true as const, data: await createNeedFromInventory(input) };
  } catch (e) {
    return fail(e);
  }
}

export async function ignoreNeedAction(code: string) {
  try {
    await updateProductionRequirementStatus(code, "ignored");
    return { ok: true as const, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function listVendorOrdersAction() {
  try {
    return { ok: true as const, data: await listVendorOrders() };
  } catch (e) {
    return fail(e);
  }
}

export async function getVendorOrderAction(orderNumber: string) {
  try {
    const order = await getVendorOrder(orderNumber);
    if (!order) return { ok: false as const, error: "Order not found" };
    const [workflow, payments, communications, vendor] = await Promise.all([
      getWorkflowInstanceForOrder(orderNumber),
      listVendorPayments(orderNumber),
      listCommunications(orderNumber),
      getMfgVendor(order.vendorId),
    ]);
    return {
      ok: true as const,
      data: { order, workflow, payments, communications, vendor },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function createVendorOrderAction(input: {
  vendorCode: string;
  items: Array<{
    productCode: string;
    variantCode?: string | null;
    title: string;
    variantLabel?: string;
    sku?: string;
    quantity: number;
    unitCost?: number | null;
    colour?: string;
    sizeLabel?: string;
  }>;
  notes?: string;
  requestedDeliveryDate?: string | null;
  requirementCode?: string | null;
}) {
  try {
    const order = await createVendorOrder(input);
    if (input.requirementCode) {
      await updateProductionRequirementStatus(input.requirementCode, "ordered");
    }
    return { ok: true as const, data: order };
  } catch (e) {
    return fail(e);
  }
}

export async function generateOrderPdfAction(orderNumber: string) {
  try {
    const { version } = await generateVendorOrderPdf(orderNumber);
    return { ok: true as const, data: version };
  } catch (e) {
    return fail(e);
  }
}

export async function prepareSendOrderAction(orderNumber: string) {
  try {
    return { ok: true as const, data: await prepareSendVendorOrder(orderNumber) };
  } catch (e) {
    return fail(e);
  }
}

export async function sendViaWhatsAppAction(orderNumber: string) {
  try {
    return { ok: true as const, data: await initiateWhatsAppSend(orderNumber) };
  } catch (e) {
    return fail(e);
  }
}

export async function markOrderSentAction(orderNumber: string) {
  try {
    await markVendorOrderSent(orderNumber);
    return { ok: true as const, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function recordConfirmationAction(input: {
  orderNumber: string;
  confirmed: boolean;
  committedDeliveryDate?: string | null;
  confirmedPrice?: number | null;
  vendorNotes?: string;
}) {
  try {
    await recordVendorConfirmation(input);
    return { ok: true as const, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function advanceWorkflowAction(orderNumber: string, notes?: string) {
  try {
    const w = await completeActiveWorkflowStep(orderNumber, notes);
    return { ok: true as const, data: w };
  } catch (e) {
    return fail(e);
  }
}

export async function markPaymentPaidAction(paymentId: string, reference?: string) {
  try {
    await markPaymentPaid(paymentId, reference);
    return { ok: true as const, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setOrderStatusAction(
  orderNumber: string,
  status: Parameters<typeof updateVendorOrderStatus>[1],
) {
  try {
    await updateVendorOrderStatus(orderNumber, status);
    return { ok: true as const, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function prepareReceiveStockAction(orderNumber: string) {
  try {
    const poIds = await syncVendorOrderToLegacyPurchaseOrders(orderNumber);
    return { ok: true as const, data: { poIds, receiveHref: `/receive?po=${encodeURIComponent(poIds[0] ?? orderNumber)}` } };
  } catch (e) {
    return fail(e);
  }
}

export async function listProductsForManufactureAction() {
  try {
    const products = await listProducts();
    return {
      ok: true as const,
      data: products.map((p) => ({
        id: p.id,
        title: p.title,
        sku: p.sku,
        variants: p.variants.map((v) => ({
          id: v.id,
          label: v.label,
          sku: v.sku,
        })),
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function listPersistedRequirementsAction() {
  try {
    return { ok: true as const, data: await listProductionRequirements() };
  } catch (e) {
    return fail(e);
  }
}
