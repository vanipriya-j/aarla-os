/**
 * Stock-check desk flow — resolves order/line state into guided next steps
 * (studio → pack | reseller recall | Ask Vani / customer).
 */
import type {
  FulfilmentOrderDetail,
  FulfilmentLineRow,
  FulfilmentTaskRow,
} from "@/lib/repositories/fulfilment";

export type StockFlowStepId =
  | "check-studio"
  | "resolve-missing"
  | "ready-to-pack"
  | "waiting-customer"
  | "refund";

export type LineFlowBranch =
  | "unchecked"
  | "studio-found"
  | "need-reseller"
  | "reseller-arranged"
  | "reseller-in-transit"
  | "reseller-received"
  | "ask-vani"
  | "customer-wait"
  | "customer-alternative"
  | "refund";

export type LineFlowState = {
  lineId: string;
  branch: LineFlowBranch;
  nextLabel: string;
  partnerTask: FulfilmentTaskRow | null;
  customerTask: FulfilmentTaskRow | null;
};

export type OrderStockFlow = {
  step: StockFlowStepId;
  stepLabel: string;
  steps: Array<{ id: StockFlowStepId; label: string; state: "done" | "current" | "todo" }>;
  lines: LineFlowState[];
  allStudioOrResolved: boolean;
  missingCount: number;
};

function partnerTaskFor(
  detail: FulfilmentOrderDetail,
  lineId: string,
): FulfilmentTaskRow | null {
  return (
    detail.tasks.find(
      (t) =>
        t.fulfilmentLineId === lineId &&
        t.taskType === "partner-stock-recall" &&
        !["completed", "cancelled"].includes(t.status),
    ) ?? null
  );
}

function customerTaskFor(
  detail: FulfilmentOrderDetail,
  lineId: string,
): FulfilmentTaskRow | null {
  return (
    detail.tasks.find(
      (t) =>
        t.fulfilmentLineId === lineId &&
        t.taskType === "customer-contact" &&
        ["open", "waiting"].includes(t.status),
    ) ?? null
  );
}

export function lineStockFlowState(
  detail: FulfilmentOrderDetail,
  line: FulfilmentLineRow,
): LineFlowState {
  const partnerTask = partnerTaskFor(detail, line.id);
  const customerTask = customerTaskFor(detail, line.id);

  if (detail.status === "refund-required" || line.resolution === "refund-cancel") {
    return {
      lineId: line.id,
      branch: "refund",
      nextLabel: "Refund / cancel required",
      partnerTask,
      customerTask,
    };
  }
  if (line.resolution === "customer-wait") {
    return {
      lineId: line.id,
      branch: "customer-wait",
      nextLabel: "Customer will wait — keep looking / follow up",
      partnerTask,
      customerTask,
    };
  }
  if (line.resolution === "customer-alternative") {
    return {
      lineId: line.id,
      branch: "customer-alternative",
      nextLabel: "Customer takes something else — continue",
      partnerTask,
      customerTask,
    };
  }
  if (customerTask) {
    return {
      lineId: line.id,
      branch: "ask-vani",
      nextLabel: "Ask Vani — record customer decision",
      partnerTask,
      customerTask,
    };
  }
  if (partnerTask?.status === "received") {
    return {
      lineId: line.id,
      branch: "reseller-received",
      nextLabel: "Received from reseller",
      partnerTask,
      customerTask,
    };
  }
  if (partnerTask?.status === "in-transit") {
    return {
      lineId: line.id,
      branch: "reseller-in-transit",
      nextLabel: "Reseller pick-up in progress — mark received when it arrives",
      partnerTask,
      customerTask,
    };
  }
  if (partnerTask && ["requested", "open"].includes(partnerTask.status)) {
    return {
      lineId: line.id,
      branch: "reseller-arranged",
      nextLabel: "Message reseller / arrange pick-up",
      partnerTask,
      customerTask,
    };
  }
  if (line.physicalStatus === "found" || line.resolution === "physical-found") {
    return {
      lineId: line.id,
      branch: "studio-found",
      nextLabel: "Found in studio",
      partnerTask,
      customerTask,
    };
  }
  if (line.physicalStatus === "not-found") {
    return {
      lineId: line.id,
      branch: "need-reseller",
      nextLabel: "Not in studio — arrange from reseller or Ask Vani",
      partnerTask,
      customerTask,
    };
  }
  return {
    lineId: line.id,
    branch: "unchecked",
    nextLabel: "Check studio shelf",
    partnerTask,
    customerTask,
  };
}

export function resolveOrderStockFlow(detail: FulfilmentOrderDetail): OrderStockFlow {
  const lines = detail.lines.map((line) => lineStockFlowState(detail, line));
  const missingCount = lines.filter((l) =>
    ["unchecked", "need-reseller", "reseller-arranged", "reseller-in-transit", "ask-vani"].includes(
      l.branch,
    ),
  ).length;
  const allStudioOrResolved = lines.every((l) =>
    ["studio-found", "reseller-received", "customer-alternative"].includes(l.branch),
  );

  let step: StockFlowStepId = "check-studio";
  let stepLabel = "Check each line in studio";
  if (detail.status === "refund-required") {
    step = "refund";
    stepLabel = "Refund / cancel required";
  } else if (
    detail.status === "ready-to-pack" ||
    detail.status === "ready-to-pick" ||
    detail.pickedAt ||
    allStudioOrResolved
  ) {
    step = "ready-to-pack";
    stepLabel = "Ready to pack";
  } else if (lines.some((l) => l.branch === "ask-vani" || l.branch === "customer-wait")) {
    step = "waiting-customer";
    stepLabel = "Ask Vani / waiting on customer";
  } else if (lines.some((l) => l.branch !== "unchecked" && l.branch !== "studio-found")) {
    step = "resolve-missing";
    stepLabel = "Resolve missing lines (reseller or Ask Vani)";
  }

  const stepDefs: Array<{ id: StockFlowStepId; label: string }> = [
    { id: "check-studio", label: "1. Studio" },
    { id: "resolve-missing", label: "2. Reseller / Vani" },
    { id: "ready-to-pack", label: "3. Pack" },
  ];
  const order = ["check-studio", "resolve-missing", "ready-to-pack", "waiting-customer", "refund"];
  const currentIdx = order.indexOf(step);

  return {
    step,
    stepLabel,
    steps: stepDefs.map((s) => {
      const idx = order.indexOf(s.id);
      if (step === "ready-to-pack") {
        return { ...s, state: idx <= 2 ? "done" : "todo" };
      }
      if (step === "waiting-customer" || step === "refund") {
        if (s.id === "check-studio") return { ...s, state: "done" };
        if (s.id === "resolve-missing") return { ...s, state: "current" };
        return { ...s, state: "todo" };
      }
      if (idx < currentIdx) return { ...s, state: "done" as const };
      if (idx === currentIdx) return { ...s, state: "current" as const };
      return { ...s, state: "todo" as const };
    }),
    lines,
    allStudioOrResolved,
    missingCount,
  };
}
