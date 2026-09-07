"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as services from "@/lib/application/services";
import { PartnerCommerceService } from "@/lib/application/partner-commerce-service";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

export async function transferFromPartnerAction(input: {
  productId: string;
  variantId?: string;
  partnerId: string;
  quantity: number;
  notes?: string;
  reference?: string;
}) {
  return wrap(() => services.transferFromPartner(input));
}

export async function listUnbilledPartnerSalesAction(partnerId: string) {
  return wrap(() => PartnerCommerceService.listUnbilledSales(partnerId));
}

export async function listPartnerInvoicesAction(partnerId?: string) {
  return wrap(() => PartnerCommerceService.listInvoices(partnerId));
}

export async function getPartnerInvoiceAction(idOrCode: string) {
  return wrap(() => PartnerCommerceService.getInvoice(idOrCode));
}

export async function raisePartnerInvoiceAction(input: {
  partnerId: string;
  movementUuids: string[];
  adjustedTotal: number;
  notes?: string;
  issue?: boolean;
}) {
  return wrap(() =>
    PartnerCommerceService.raiseInvoice({
      partnerCode: input.partnerId,
      movementUuids: input.movementUuids,
      adjustedTotal: input.adjustedTotal,
      notes: input.notes,
      issue: input.issue ?? true,
    }),
  );
}

export async function receivePartnerPaymentAction(input: {
  invoiceId: string;
  amount: number;
  notes?: string;
  paidAt?: string;
  screenshotBase64?: string | null;
  screenshotFilename?: string;
  screenshotMimeType?: string;
}) {
  return wrap(() => PartnerCommerceService.receivePayment(input));
}
