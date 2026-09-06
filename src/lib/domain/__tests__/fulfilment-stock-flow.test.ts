import { describe, expect, it } from "vitest";
import {
  lineStockFlowState,
  resolveOrderStockFlow,
} from "@/lib/domain/fulfilment-stock-flow";
import type { FulfilmentOrderDetail } from "@/lib/repositories/fulfilment";

function baseDetail(
  overrides: Partial<FulfilmentOrderDetail> & {
    lines: FulfilmentOrderDetail["lines"];
    tasks?: FulfilmentOrderDetail["tasks"];
  },
): FulfilmentOrderDetail {
  return {
    id: "fo-1",
    externalOrderId: "eo-1",
    orderNumber: "#1531",
    customerName: "Test",
    orderDate: "2026-09-01T00:00:00Z",
    financialStatus: "PAID",
    shopifyFulfilmentStatus: "UNFULFILLED",
    totalAmount: 100,
    currency: "INR",
    status: "stock-check",
    shippingMethod: null,
    awb: null,
    labelStatus: null,
    packedAt: null,
    handedOverAt: null,
    alternateAwaitingAwbCost: false,
    updatedAt: "2026-09-01T00:00:00Z",
    openTaskCount: 0,
    contactPhone: null,
    shippingCity: null,
    shippingZip: null,
    packingSuggestion: null,
    packingActual: null,
    packingOverrideNote: null,
    freebieProductCode: null,
    freebieChoice: null,
    shippingRecommendation: null,
    shippingRecommendationReasons: null,
    shippingOverrideReason: null,
    courierProvider: null,
    courierReference: null,
    courierCost: null,
    pickedAt: null,
    pickedBy: null,
    packedBy: null,
    handedOverBy: null,
    customerInformedAt: null,
    pickedUpAt: null,
    localProvider: null,
    localNotes: null,
    events: [],
    tasks: [],
    resellerLocations: [],
    ...overrides,
  };
}

function line(
  partial: Partial<FulfilmentOrderDetail["lines"][number]> & { id: string },
): FulfilmentOrderDetail["lines"][number] {
  return {
    fulfilmentOrderId: "fo-1",
    externalOrderItemId: "ei-1",
    title: "Tote",
    variantTitle: null,
    requiredQuantity: 1,
    unitPrice: 100,
    externalProductId: null,
    externalVariantId: null,
    systemStudioQty: null,
    catalogProductCode: null,
    catalogVariantCode: null,
    physicalStatus: "unchecked",
    physicalCheckedAt: null,
    picked: false,
    pickedAt: null,
    resolution: null,
    partnerStock: [],
    ...partial,
  };
}

describe("fulfilment-stock-flow", () => {
  it("starts on studio check when lines are unchecked", () => {
    const detail = baseDetail({
      lines: [line({ id: "l1" }), line({ id: "l2" })],
    });
    const flow = resolveOrderStockFlow(detail);
    expect(flow.step).toBe("check-studio");
    expect(flow.lines.every((l) => l.branch === "unchecked")).toBe(true);
  });

  it("moves to resolve-missing when a line is not in studio", () => {
    const detail = baseDetail({
      lines: [
        line({ id: "l1", physicalStatus: "found", resolution: "physical-found" }),
        line({ id: "l2", physicalStatus: "not-found" }),
      ],
    });
    const flow = resolveOrderStockFlow(detail);
    expect(flow.step).toBe("resolve-missing");
    expect(lineStockFlowState(detail, detail.lines[1]!).branch).toBe("need-reseller");
  });

  it("is ready-to-pack when every line is studio-found", () => {
    const detail = baseDetail({
      status: "ready-to-pack",
      pickedAt: "2026-09-01T01:00:00Z",
      lines: [
        line({ id: "l1", physicalStatus: "found", resolution: "physical-found" }),
        line({ id: "l2", physicalStatus: "found", resolution: "physical-found" }),
      ],
    });
    expect(resolveOrderStockFlow(detail).step).toBe("ready-to-pack");
  });

  it("surfaces Ask Vani when a customer-contact task is open", () => {
    const detail = baseDetail({
      lines: [line({ id: "l1", physicalStatus: "not-found" })],
      tasks: [
        {
          id: "t1",
          fulfilmentOrderId: "fo-1",
          fulfilmentLineId: "l1",
          taskType: "customer-contact",
          status: "waiting",
          title: "Ask Vani",
          description: "Speak to customer",
          assignee: null,
          dueAt: null,
          partnerCode: null,
          partnerLocationCode: null,
          quantity: null,
          founderDecision: null,
          expectedAvailabilityAt: null,
          customerOutcome: null,
          customerContactedAt: null,
          alternativeNote: null,
          notes: null,
          completedAt: null,
          createdAt: "2026-09-01T00:00:00Z",
        },
      ],
    });
    const flow = resolveOrderStockFlow(detail);
    expect(flow.step).toBe("waiting-customer");
    expect(flow.lines[0]!.branch).toBe("ask-vani");
  });
});
