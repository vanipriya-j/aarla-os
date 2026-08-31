import {
  orderAgeDays,
  recommendShippingMode,
  suggestFreebie,
  suggestPacking,
} from "@/lib/domain/fulfilment-decisions";
import {
  fulfilmentStatusLabel,
  isPastFulfilmentCutoff,
  type CustomerFulfilmentOutcome,
  type FounderAvailabilityDecision,
  type FulfilmentShippingMethod,
  type FulfilmentStatus,
  type FulfilmentTab,
  type PhysicalStockStatus,
} from "@/lib/domain/fulfilment-types";
import { balanceAt, deriveBalances } from "@/lib/domain/ledger";
import { LOC_CODES } from "@/lib/engine/business-engine";
import { transferStock } from "@/lib/application/services";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query } from "@/lib/infra/db/pool";
import { createFulfilmentRepository } from "@/lib/infra/repositories/postgres-fulfilment";
import type {
  FulfilmentOrderDetail,
  FulfilmentOrderListItem,
  FulfilmentRepository,
} from "@/lib/repositories/fulfilment";

function repo(): FulfilmentRepository {
  return createFulfilmentRepository();
}

async function studioQtyForProductCode(
  productCode: string | null,
  variantCode: string | null,
): Promise<number | null> {
  if (!productCode) return null;
  const movements = await query<{
    product_code: string;
    variant_code: string | null;
    from_code: string;
    to_code: string;
    quantity: number;
  }>(
    `select pr.code as product_code,
            pv.code as variant_code,
            fl.code as from_code,
            tl.code as to_code,
            m.quantity
     from stock_movements m
     join products pr on pr.id = m.product_id
     left join product_variants pv on pv.id = m.variant_id
     join locations fl on fl.id = m.from_location_id
     join locations tl on tl.id = m.to_location_id
     where m.organization_id = $1 and pr.code = $2`,
    [ORG_ID, productCode],
  );
  if (!movements.length) return 0;
  const balances = deriveBalances(
    movements.map((m, i) => ({
      id: `m-${i}`,
      date: "2026-01-01",
      productId: m.product_code,
      variantId: m.variant_code ?? undefined,
      quantity: Number(m.quantity),
      fromLocationId: m.from_code,
      toLocationId: m.to_code,
      movementType: "Transfer" as const,
      reference: `read-${i}`,
      notes: "",
    })),
  );
  return balanceAt(balances, productCode, LOC_CODES.studio, variantCode ?? "");
}

async function matchCatalog(title: string, variantTitle: string | null) {
  const rows = await query<{ product_code: string; variant_code: string | null }>(
    `select p.code as product_code, v.code as variant_code
     from products p
     left join product_variants v on v.product_id = p.id and v.organization_id = p.organization_id
     where p.organization_id = $1
       and (
         p.title ilike $2
         or ($3::text is not null and v.label ilike '%' || $3 || '%')
       )
     order by case when p.title ilike $2 then 0 else 1 end
     limit 1`,
    [ORG_ID, title, variantTitle],
  );
  if (!rows[0]) return { productCode: null as string | null, variantCode: null as string | null };
  return {
    productCode: String(rows[0].product_code),
    variantCode: rows[0].variant_code == null ? null : String(rows[0].variant_code),
  };
}

async function loadExternalLines(externalOrderId: string) {
  return query<{
    id: string;
    title: string;
    variant_title: string | null;
    quantity: number;
  }>(
    `select id, title, variant_title, quantity
     from external_order_items where external_order_id = $1 order by title`,
    [externalOrderId],
  );
}

export async function recomputeFulfilmentStatus(
  fulfilmentOrderId: string,
  r: FulfilmentRepository = repo(),
): Promise<FulfilmentStatus> {
  const detail = await r.getDetail(fulfilmentOrderId);
  if (!detail) throw new Error("Fulfilment order not found");
  if (
    detail.status === "dispatched" ||
    detail.status === "cancelled" ||
    detail.status === "refund-required"
  ) {
    return detail.status;
  }

  const openTasks = detail.tasks.filter(
    (t) => !["completed", "cancelled", "received"].includes(t.status),
  );
  const hasPartnerWait = openTasks.some(
    (t) => t.taskType === "partner-stock-recall" && ["open", "requested", "in-transit"].includes(t.status),
  );
  const hasFounderWait = openTasks.some(
    (t) => t.taskType === "founder-availability-decision" && ["open", "waiting"].includes(t.status),
  );
  const hasCustomerWait = openTasks.some(
    (t) => t.taskType === "customer-contact" && ["open", "waiting"].includes(t.status),
  );

  if (hasCustomerWait) {
    await r.setStatus(fulfilmentOrderId, "waiting-for-customer");
    return "waiting-for-customer";
  }
  if (hasFounderWait) {
    await r.setStatus(fulfilmentOrderId, "waiting-for-founder-decision");
    return "waiting-for-founder-decision";
  }
  if (hasPartnerWait) {
    await r.setStatus(fulfilmentOrderId, "waiting-for-partner-stock");
    return "waiting-for-partner-stock";
  }

  const lines = detail.lines;
  const readyLines = lines.every((l) => {
    if (l.physicalStatus === "found" || l.resolution === "physical-found") return true;
    if (l.resolution === "founder-arrange" || l.resolution === "customer-wait") return true;
    if (l.resolution === "customer-alternative") return true;
    if (l.resolution === "partner-recall") {
      const task = detail.tasks.find(
        (t) => t.fulfilmentLineId === l.id && t.taskType === "partner-stock-recall",
      );
      return task?.status === "received";
    }
    return false;
  });

  if (detail.pickedAt && detail.packedAt) {
    if (detail.shippingMethod === "store-pickup") {
      await r.setStatus(fulfilmentOrderId, "ready-for-pickup");
      return "ready-for-pickup";
    }
    if (detail.awb || detail.shippingMethod === "local-delivery" || detail.shippingMethod === "alternate-courier") {
      if (detail.shippingMethod === "delhivery-surface" || detail.shippingMethod === "delhivery-express") {
        if (detail.awb) {
          await r.setStatus(fulfilmentOrderId, "ready-for-handover");
          return "ready-for-handover";
        }
      } else if (detail.shippingMethod === "alternate-courier" && detail.alternateAwaitingAwbCost) {
        await r.setStatus(fulfilmentOrderId, "ready-for-handover");
        return "ready-for-handover";
      } else if (detail.shippingMethod === "local-delivery") {
        await r.setStatus(fulfilmentOrderId, "ready-for-handover");
        return "ready-for-handover";
      }
    }
    await r.setStatus(fulfilmentOrderId, "ready-to-ship");
    return "ready-to-ship";
  }

  if (detail.pickedAt) {
    await r.setStatus(fulfilmentOrderId, "ready-to-pack");
    return "ready-to-pack";
  }

  if (readyLines && lines.length > 0) {
    await r.setStatus(fulfilmentOrderId, "ready-to-pick");
    return "ready-to-pick";
  }

  const anyNotFound = lines.some((l) => l.physicalStatus === "not-found");
  if (anyNotFound && !readyLines) {
    await r.setStatus(fulfilmentOrderId, "stock-exception");
    return "stock-exception";
  }

  await r.setStatus(fulfilmentOrderId, "stock-check");
  return "stock-check";
}

export async function listFulfilmentWorkbench(tab: FulfilmentTab): Promise<{
  rows: FulfilmentOrderListItem[];
  pastCutoff: boolean;
  cutoffLabel: string;
}> {
  const r = repo();
  const rows = await r.listWorkbench(tab);
  return {
    rows,
    pastCutoff: isPastFulfilmentCutoff(),
    cutoffLabel: "12:30 PM Asia/Kolkata",
  };
}

export async function getFulfilmentDetail(id: string): Promise<FulfilmentOrderDetail | null> {
  const r = repo();
  const detail = await r.getDetail(id);
  if (!detail) return null;
  // Enrich partner stock for not-found / unchecked lines (read-only).
  for (const line of detail.lines) {
    if (line.physicalStatus !== "found") {
      line.partnerStock = await r.listPartnerStockBySkuHint(line.title);
    }
  }
  return detail;
}

export async function syncIncomingOrdersIntoFulfilment(limit = 40): Promise<{
  created: number;
  ids: string[];
}> {
  const r = repo();
  const unlinked = await r.listUnlinkedValidExternalOrders(limit);
  const ids: string[] = [];
  for (const order of unlinked) {
    const items = await loadExternalLines(order.id);
    const lines = [];
    for (const item of items) {
      const match = await matchCatalog(item.title, item.variant_title);
      const systemStudioQty = await studioQtyForProductCode(
        match.productCode,
        match.variantCode,
      );
      lines.push({
        externalOrderItemId: item.id,
        requiredQuantity: Number(item.quantity) || 1,
        systemStudioQty,
        catalogProductCode: match.productCode,
        catalogVariantCode: match.variantCode,
      });
    }
    const detail = await r.ensureFromExternalOrder({
      externalOrderId: order.id,
      lines,
    });
    ids.push(detail.id);
  }
  return { created: ids.length, ids };
}

export async function setLinePhysicalCheck(input: {
  fulfilmentOrderId: string;
  lineId: string;
  physicalStatus: PhysicalStockStatus;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  await r.setPhysicalStatus(input.lineId, input.physicalStatus, input.actor ?? null);
  const detail = await r.getDetail(input.fulfilmentOrderId);
  const line = detail?.lines.find((l) => l.id === input.lineId);
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "physical-check",
    summary:
      input.physicalStatus === "found"
        ? `Physical found: ${line?.title ?? "item"}`
        : `Physical not found: ${line?.title ?? "item"}`,
    actor: input.actor ?? null,
  });
  await recomputeFulfilmentStatus(input.fulfilmentOrderId, r);
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function requestPartnerRecall(input: {
  fulfilmentOrderId: string;
  lineId: string;
  partnerCode: string;
  partnerLocationCode: string;
  quantity: number;
  actor?: string | null;
  notes?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  const detail = await r.getDetail(input.fulfilmentOrderId);
  const line = detail?.lines.find((l) => l.id === input.lineId);
  await r.createTask({
    fulfilmentOrderId: input.fulfilmentOrderId,
    fulfilmentLineId: input.lineId,
    taskType: "partner-stock-recall",
    status: "requested",
    title: `Recall from ${input.partnerCode}`,
    description: `${line?.title ?? "Item"} × ${input.quantity}`,
    partnerCode: input.partnerCode,
    partnerLocationCode: input.partnerLocationCode,
    quantity: input.quantity,
    createdBy: input.actor ?? null,
    notes: input.notes ?? null,
  });
  await r.setLineResolution(input.lineId, "partner-recall");
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "partner-recall-requested",
    summary: `Partner recall requested from ${input.partnerCode} for ${line?.title ?? "item"}`,
    actor: input.actor ?? null,
  });
  await recomputeFulfilmentStatus(input.fulfilmentOrderId, r);
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function receivePartnerRecall(input: {
  fulfilmentOrderId: string;
  taskId: string;
  productId: string;
  variantId?: string;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  const detail = await r.getDetail(input.fulfilmentOrderId);
  const task = detail?.tasks.find((t) => t.id === input.taskId);
  if (!task || task.taskType !== "partner-stock-recall") {
    throw new Error("Partner recall task not found");
  }
  if (!task.partnerLocationCode) throw new Error("Partner location missing on task");
  const qty = task.quantity ?? 1;
  const ref = `fulfil-recall:${input.fulfilmentOrderId}:${input.taskId}`;
  const moved = await transferStock({
    productId: input.productId,
    variantId: input.variantId,
    quantity: qty,
    fromLocationId: task.partnerLocationCode,
    toLocationId: LOC_CODES.studio,
    reference: ref,
    notes: `Fulfilment partner recall ${task.partnerCode ?? ""}`.trim(),
  });
  if (!moved) {
    throw new Error("Transfer failed — partner location may not have enough stock");
  }
  await r.updateTask(input.taskId, {
    status: "received",
    ledgerReference: ref,
    completedAt: new Date().toISOString(),
  });
  if (task.fulfilmentLineId) {
    await r.setPhysicalStatus(task.fulfilmentLineId, "found", input.actor ?? null);
    await r.setLineResolution(task.fulfilmentLineId, "partner-recall");
  }
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "partner-recall-received",
    summary: `Partner stock received at Studio (${task.partnerCode ?? "partner"})`,
    actor: input.actor ?? null,
  });
  await recomputeFulfilmentStatus(input.fulfilmentOrderId, r);
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function escalateFounderAvailability(input: {
  fulfilmentOrderId: string;
  lineId: string;
  note: string;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  const detail = await r.getDetail(input.fulfilmentOrderId);
  const line = detail?.lines.find((l) => l.id === input.lineId);
  await r.createTask({
    fulfilmentOrderId: input.fulfilmentOrderId,
    fulfilmentLineId: input.lineId,
    taskType: "founder-availability-decision",
    status: "waiting",
    title: "Ask Vani — availability decision",
    description: `${line?.title ?? "Item"} × ${line?.requiredQuantity ?? 1}. ${input.note}`,
    createdBy: input.actor ?? null,
  });
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "founder-escalation",
    summary: `Founder decision requested for ${line?.title ?? "item"}`,
    actor: input.actor ?? null,
  });
  await recomputeFulfilmentStatus(input.fulfilmentOrderId, r);
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function recordFounderDecision(input: {
  fulfilmentOrderId: string;
  taskId: string;
  decision: FounderAvailabilityDecision;
  expectedAvailabilityAt?: string | null;
  note?: string | null;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  const detail = await r.getDetail(input.fulfilmentOrderId);
  const task = detail?.tasks.find((t) => t.id === input.taskId);
  await r.updateTask(input.taskId, {
    status: input.decision === "cannot-arrange" ? "completed" : "completed",
    founderDecision: input.decision,
    expectedAvailabilityAt: input.expectedAvailabilityAt ?? null,
    notes: input.note ?? null,
    completedAt: new Date().toISOString(),
  });
  if (task?.fulfilmentLineId && input.decision === "can-arrange") {
    await r.setLineResolution(task.fulfilmentLineId, "founder-arrange");
    await r.createTask({
      fulfilmentOrderId: input.fulfilmentOrderId,
      fulfilmentLineId: task.fulfilmentLineId,
      taskType: "customer-contact",
      status: "waiting",
      title: "Contact customer — availability",
      description: `Founder can arrange by ${input.expectedAvailabilityAt ?? "TBD"}`,
      createdBy: input.actor ?? null,
    });
  }
  if (task?.fulfilmentLineId && input.decision === "cannot-arrange") {
    await r.createTask({
      fulfilmentOrderId: input.fulfilmentOrderId,
      fulfilmentLineId: task.fulfilmentLineId,
      taskType: "customer-contact",
      status: "waiting",
      title: "Contact customer — cannot arrange",
      description: input.note ?? "Stock unavailable",
      createdBy: input.actor ?? null,
    });
  }
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "founder-decision",
    summary: `Founder decision: ${input.decision}`,
    actor: input.actor ?? null,
  });
  await recomputeFulfilmentStatus(input.fulfilmentOrderId, r);
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function recordCustomerOutcome(input: {
  fulfilmentOrderId: string;
  taskId: string;
  outcome: CustomerFulfilmentOutcome;
  note?: string | null;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  const detail = await r.getDetail(input.fulfilmentOrderId);
  const task = detail?.tasks.find((t) => t.id === input.taskId);
  await r.updateTask(input.taskId, {
    status: "completed",
    customerOutcome: input.outcome,
    customerContactedAt: new Date().toISOString(),
    alternativeNote: input.note ?? null,
    completedAt: new Date().toISOString(),
  });
  if (task?.fulfilmentLineId) {
    if (input.outcome === "will-wait") {
      await r.setLineResolution(task.fulfilmentLineId, "customer-wait");
    } else if (input.outcome === "chose-alternative") {
      await r.setLineResolution(task.fulfilmentLineId, "customer-alternative");
    } else if (input.outcome === "refund-cancel") {
      await r.setStatus(input.fulfilmentOrderId, "refund-required");
      await r.appendEvent({
        fulfilmentOrderId: input.fulfilmentOrderId,
        eventType: "refund-required",
        summary: "Customer outcome: refund / cancel required",
        actor: input.actor ?? null,
      });
      return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
    }
  }
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "customer-outcome",
    summary: `Customer outcome: ${input.outcome}`,
    actor: input.actor ?? null,
  });
  await recomputeFulfilmentStatus(input.fulfilmentOrderId, r);
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function confirmPicking(input: {
  fulfilmentOrderId: string;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  await r.confirmAllPicked(input.fulfilmentOrderId, input.actor ?? null);
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "picked",
    summary: "All items picked",
    actor: input.actor ?? null,
  });
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function decidePacking(input: {
  fulfilmentOrderId: string;
  useSuggestion: boolean;
  actual?: unknown;
  overrideNote?: string | null;
  freebieChoice: "add" | "change" | "none";
  freebieProductCode?: string | null;
  freebieNote?: string | null;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  const detail = await r.getDetail(input.fulfilmentOrderId);
  if (!detail) throw new Error("Not found");
  const suggestion = suggestPacking(
    detail.lines.map((l) => ({ title: l.title, quantity: l.requiredQuantity })),
  );
  const actual = input.useSuggestion ? suggestion : (input.actual ?? suggestion);
  await r.savePacking(input.fulfilmentOrderId, {
    suggestion,
    actual,
    overrideNote: input.useSuggestion ? null : (input.overrideNote ?? "Changed packing"),
    actor: input.actor ?? null,
  });
  await r.saveFreebie(input.fulfilmentOrderId, {
    choice: input.freebieChoice,
    productCode: input.freebieProductCode ?? null,
    note: input.freebieNote ?? null,
  });
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "packed",
    summary: input.useSuggestion
      ? "Packing suggestion accepted"
      : "Packing changed from suggestion",
    actor: input.actor ?? null,
    detail: { suggestion, actual },
  });
  await recomputeFulfilmentStatus(input.fulfilmentOrderId, r);
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function decideShipping(input: {
  fulfilmentOrderId: string;
  method: FulfilmentShippingMethod;
  overrideReason?: string | null;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  const detail = await r.getDetail(input.fulfilmentOrderId);
  if (!detail) throw new Error("Not found");
  const age = orderAgeDays(detail.orderDate);
  const decisionInputs = {
    orderAgeDays: age,
    shippingPaid: null as number | null,
    orderValue: detail.totalAmount,
    estimatedContribution: null as number | null,
    hasPromisedDate: false,
    daysUntilPromised: null as number | null,
    costsComplete: false,
  };
  const recommendation = recommendShippingMode(decisionInputs);
  await r.saveShippingDecision(input.fulfilmentOrderId, {
    method: input.method,
    recommendation: recommendation.method,
    reasons: recommendation.reasons,
    decisionInputs,
    overrideReason:
      input.method !== recommendation.method
        ? (input.overrideReason ?? "Operator override")
        : null,
    actor: input.actor ?? null,
  });
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "shipping-decision",
    summary: `Shipping method: ${input.method}`,
    actor: input.actor ?? null,
    detail: { recommendation, selected: input.method },
  });
  await recomputeFulfilmentStatus(input.fulfilmentOrderId, r);
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function saveManualCourier(input: {
  fulfilmentOrderId: string;
  awb?: string | null;
  courierProvider?: string | null;
  courierCost?: number | null;
  labelStatus?: string | null;
  alternateAwaitingAwbCost?: boolean;
  localProvider?: string | null;
  localNotes?: string | null;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  await r.saveCourierDetails(input.fulfilmentOrderId, input);
  if (input.awb) {
    await r.appendEvent({
      fulfilmentOrderId: input.fulfilmentOrderId,
      eventType: "awb-recorded",
      summary: `AWB recorded: ${input.awb}`,
      actor: input.actor ?? null,
    });
  }
  if (input.alternateAwaitingAwbCost) {
    await r.createTask({
      fulfilmentOrderId: input.fulfilmentOrderId,
      taskType: "courier-awb-cost-followup",
      status: "waiting",
      title: "Collect alternate courier AWB / cost",
      createdBy: input.actor ?? null,
    });
  }
  await recomputeFulfilmentStatus(input.fulfilmentOrderId, r);
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function confirmHandover(input: {
  fulfilmentOrderId: string;
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  await r.markHandedOver(input.fulfilmentOrderId, input.actor ?? null);
  await r.appendEvent({
    fulfilmentOrderId: input.fulfilmentOrderId,
    eventType: "handed-over",
    summary: "Handed to courier / local delivery",
    actor: input.actor ?? null,
  });
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function markStorePickupProgress(input: {
  fulfilmentOrderId: string;
  step: "informed" | "picked-up";
  actor?: string | null;
}): Promise<FulfilmentOrderDetail> {
  const r = repo();
  if (input.step === "informed") {
    await r.markCustomerInformed(input.fulfilmentOrderId);
    await r.appendEvent({
      fulfilmentOrderId: input.fulfilmentOrderId,
      eventType: "customer-informed-pickup",
      summary: "Customer informed — ready for store pickup",
      actor: input.actor ?? null,
    });
  } else {
    await r.markPickedUp(input.fulfilmentOrderId);
    await r.appendEvent({
      fulfilmentOrderId: input.fulfilmentOrderId,
      eventType: "store-picked-up",
      summary: "Customer picked up order",
      actor: input.actor ?? null,
    });
  }
  return (await getFulfilmentDetail(input.fulfilmentOrderId))!;
}

export async function getPackingAndFreebieSuggestions(fulfilmentOrderId: string) {
  const r = repo();
  const detail = await r.getDetail(fulfilmentOrderId);
  if (!detail) throw new Error("Not found");
  const packing = suggestPacking(
    detail.lines.map((l) => ({ title: l.title, quantity: l.requiredQuantity })),
  );
  const rules = await r.listFreebieRules();
  const freebie = suggestFreebie(detail.totalAmount, rules, {});
  return { packing, freebie, statusLabel: fulfilmentStatusLabel(detail.status) };
}
