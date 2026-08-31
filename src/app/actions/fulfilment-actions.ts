"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import type {
  CustomerFulfilmentOutcome,
  FounderAvailabilityDecision,
  FulfilmentShippingMethod,
  FulfilmentTab,
  PhysicalStockStatus,
} from "@/lib/domain/fulfilment-types";
import * as fulfilment from "@/lib/application/fulfilment-service";

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

export async function listFulfilmentWorkbenchAction(tab: FulfilmentTab) {
  return wrap(() => fulfilment.listFulfilmentWorkbench(tab));
}

export async function getFulfilmentDetailAction(id: string) {
  return wrap(() => fulfilment.getFulfilmentDetail(id));
}

export async function syncIncomingFulfilmentOrdersAction() {
  return wrap(() => fulfilment.syncIncomingOrdersIntoFulfilment());
}

export async function setLinePhysicalCheckAction(input: {
  fulfilmentOrderId: string;
  lineId: string;
  physicalStatus: PhysicalStockStatus;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.setLinePhysicalCheck(input));
}

export async function requestPartnerRecallAction(input: {
  fulfilmentOrderId: string;
  lineId: string;
  partnerCode: string;
  partnerLocationCode: string;
  quantity: number;
  actor?: string | null;
  notes?: string | null;
}) {
  return wrap(() => fulfilment.requestPartnerRecall(input));
}

export async function receivePartnerRecallAction(input: {
  fulfilmentOrderId: string;
  taskId: string;
  productId: string;
  variantId?: string;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.receivePartnerRecall(input));
}

export async function escalateFounderAvailabilityAction(input: {
  fulfilmentOrderId: string;
  lineId: string;
  note: string;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.escalateFounderAvailability(input));
}

export async function recordFounderDecisionAction(input: {
  fulfilmentOrderId: string;
  taskId: string;
  decision: FounderAvailabilityDecision;
  expectedAvailabilityAt?: string | null;
  note?: string | null;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.recordFounderDecision(input));
}

export async function recordCustomerOutcomeAction(input: {
  fulfilmentOrderId: string;
  taskId: string;
  outcome: CustomerFulfilmentOutcome;
  note?: string | null;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.recordCustomerOutcome(input));
}

export async function confirmPickingAction(input: {
  fulfilmentOrderId: string;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.confirmPicking(input));
}

export async function decidePackingAction(input: {
  fulfilmentOrderId: string;
  useSuggestion: boolean;
  actual?: unknown;
  overrideNote?: string | null;
  freebieChoice: "add" | "change" | "none";
  freebieProductCode?: string | null;
  freebieNote?: string | null;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.decidePacking(input));
}

export async function decideShippingAction(input: {
  fulfilmentOrderId: string;
  method: FulfilmentShippingMethod;
  overrideReason?: string | null;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.decideShipping(input));
}

export async function saveManualCourierAction(input: {
  fulfilmentOrderId: string;
  awb?: string | null;
  courierProvider?: string | null;
  courierCost?: number | null;
  labelStatus?: string | null;
  alternateAwaitingAwbCost?: boolean;
  localProvider?: string | null;
  localNotes?: string | null;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.saveManualCourier(input));
}

export async function confirmHandoverAction(input: {
  fulfilmentOrderId: string;
  actor?: string | null;
}) {
  return wrap(() => fulfilment.confirmHandover(input));
}

export async function markStorePickupProgressAction(input: {
  fulfilmentOrderId: string;
  step: "informed" | "picked-up";
  actor?: string | null;
}) {
  return wrap(() => fulfilment.markStorePickupProgress(input));
}

export async function getPackingSuggestionsAction(fulfilmentOrderId: string) {
  return wrap(() => fulfilment.getPackingAndFreebieSuggestions(fulfilmentOrderId));
}
