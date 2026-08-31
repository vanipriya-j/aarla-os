import type {
  CustomerFulfilmentOutcome,
  FounderAvailabilityDecision,
  FulfilmentShippingMethod,
  FulfilmentStatus,
  FulfilmentTab,
  FulfilmentTaskType,
  PhysicalStockStatus,
} from "@/lib/domain/fulfilment-types";

export type FulfilmentLineRow = {
  id: string;
  fulfilmentOrderId: string;
  externalOrderItemId: string;
  title: string;
  variantTitle: string | null;
  requiredQuantity: number;
  unitPrice: number;
  externalProductId: string | null;
  externalVariantId: string | null;
  systemStudioQty: number | null;
  catalogProductCode: string | null;
  catalogVariantCode: string | null;
  physicalStatus: PhysicalStockStatus;
  physicalCheckedAt: string | null;
  picked: boolean;
  pickedAt: string | null;
  resolution: string | null;
  partnerStock: Array<{ partnerCode: string; partnerName: string; locationCode: string; qty: number }>;
};

export type FulfilmentTaskRow = {
  id: string;
  fulfilmentOrderId: string;
  fulfilmentLineId: string | null;
  taskType: FulfilmentTaskType;
  status: string;
  title: string;
  description: string;
  assignee: string | null;
  dueAt: string | null;
  partnerCode: string | null;
  partnerLocationCode: string | null;
  quantity: number | null;
  founderDecision: FounderAvailabilityDecision | null;
  expectedAvailabilityAt: string | null;
  customerOutcome: CustomerFulfilmentOutcome | null;
  customerContactedAt: string | null;
  alternativeNote: string | null;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type FulfilmentEventRow = {
  id: string;
  eventType: string;
  summary: string;
  detail: unknown;
  actor: string | null;
  createdAt: string;
};

export type FulfilmentOrderListItem = {
  id: string;
  externalOrderId: string;
  orderNumber: string;
  customerName: string | null;
  orderDate: string;
  financialStatus: string | null;
  shopifyFulfilmentStatus: string | null;
  totalAmount: number;
  currency: string;
  status: FulfilmentStatus;
  shippingMethod: FulfilmentShippingMethod | null;
  awb: string | null;
  labelStatus: string | null;
  packedAt: string | null;
  handedOverAt: string | null;
  alternateAwaitingAwbCost: boolean;
  updatedAt: string;
  openTaskCount: number;
};

export type FulfilmentOrderDetail = FulfilmentOrderListItem & {
  contactPhone: string | null;
  shippingCity: string | null;
  shippingZip: string | null;
  packingSuggestion: unknown;
  packingActual: unknown;
  packingOverrideNote: string | null;
  freebieProductCode: string | null;
  freebieChoice: string | null;
  shippingRecommendation: string | null;
  shippingRecommendationReasons: unknown;
  shippingOverrideReason: string | null;
  courierProvider: string | null;
  courierReference: string | null;
  courierCost: number | null;
  pickedAt: string | null;
  pickedBy: string | null;
  packedBy: string | null;
  handedOverBy: string | null;
  customerInformedAt: string | null;
  pickedUpAt: string | null;
  localProvider: string | null;
  localNotes: string | null;
  lines: FulfilmentLineRow[];
  tasks: FulfilmentTaskRow[];
  events: FulfilmentEventRow[];
};

export type UpsertFulfilmentFromExternalInput = {
  externalOrderId: string;
  lines: Array<{
    externalOrderItemId: string;
    requiredQuantity: number;
    systemStudioQty: number | null;
    catalogProductCode: string | null;
    catalogVariantCode: string | null;
  }>;
};

export interface FulfilmentRepository {
  listWorkbench(tab: FulfilmentTab): Promise<FulfilmentOrderListItem[]>;
  getDetail(fulfilmentOrderId: string): Promise<FulfilmentOrderDetail | null>;
  ensureFromExternalOrder(input: UpsertFulfilmentFromExternalInput): Promise<FulfilmentOrderDetail>;
  listUnlinkedValidExternalOrders(limit?: number): Promise<
    Array<{
      id: string;
      orderNumber: string;
      orderDate: string;
      customerName: string | null;
      totalAmount: number;
      financialStatus: string | null;
      fulfilmentStatus: string | null;
    }>
  >;
  /** Move wrongly pulled stock-check rows that are already Shopify-fulfilled or Delhivery-delivered out of the active queue. */
  archiveAlreadyShippedStockChecks(): Promise<number>;
  setStatus(fulfilmentOrderId: string, status: FulfilmentStatus): Promise<void>;
  setPhysicalStatus(
    lineId: string,
    physicalStatus: PhysicalStockStatus,
    actor: string | null,
  ): Promise<void>;
  setLineResolution(lineId: string, resolution: string | null): Promise<void>;
  setLinePicked(lineId: string, picked: boolean, actor: string | null): Promise<void>;
  confirmAllPicked(fulfilmentOrderId: string, actor: string | null): Promise<void>;
  savePacking(
    fulfilmentOrderId: string,
    input: {
      suggestion: unknown;
      actual: unknown;
      overrideNote: string | null;
      actor: string | null;
    },
  ): Promise<void>;
  saveFreebie(
    fulfilmentOrderId: string,
    input: {
      choice: "add" | "change" | "none";
      productCode: string | null;
      note: string | null;
    },
  ): Promise<void>;
  saveShippingDecision(
    fulfilmentOrderId: string,
    input: {
      method: FulfilmentShippingMethod;
      recommendation: string | null;
      reasons: unknown;
      decisionInputs: unknown;
      overrideReason: string | null;
      actor: string | null;
    },
  ): Promise<void>;
  saveCourierDetails(
    fulfilmentOrderId: string,
    input: {
      awb?: string | null;
      courierProvider?: string | null;
      courierReference?: string | null;
      courierCost?: number | null;
      labelStatus?: string | null;
      alternateAwaitingAwbCost?: boolean;
      localProvider?: string | null;
      localNotes?: string | null;
      localBookingRef?: string | null;
      localDeliveryCost?: number | null;
    },
  ): Promise<void>;
  markHandedOver(fulfilmentOrderId: string, actor: string | null): Promise<void>;
  markCustomerInformed(fulfilmentOrderId: string): Promise<void>;
  markPickedUp(fulfilmentOrderId: string): Promise<void>;
  createTask(input: {
    fulfilmentOrderId: string;
    fulfilmentLineId?: string | null;
    taskType: FulfilmentTaskType;
    status?: string;
    title: string;
    description?: string;
    assignee?: string | null;
    dueAt?: string | null;
    partnerCode?: string | null;
    partnerLocationCode?: string | null;
    quantity?: number | null;
    createdBy?: string | null;
    notes?: string | null;
  }): Promise<string>;
  updateTask(
    taskId: string,
    patch: Partial<{
      status: string;
      founderDecision: FounderAvailabilityDecision | null;
      expectedAvailabilityAt: string | null;
      customerOutcome: CustomerFulfilmentOutcome | null;
      customerContactedAt: string | null;
      alternativeNote: string | null;
      notes: string | null;
      ledgerReference: string | null;
      completedAt: string | null;
    }>,
  ): Promise<void>;
  appendEvent(input: {
    fulfilmentOrderId: string;
    eventType: string;
    summary: string;
    detail?: unknown;
    actor?: string | null;
  }): Promise<void>;
  listFreebieRules(): Promise<
    Array<{
      name: string;
      minOrderValue: number;
      maxOrderValue: number | null;
      productCode: string;
      variantCode: string | null;
      estimatedCost: number | null;
      priority: number;
    }>
  >;
  /** Most recent operator packing override for a similar line signature. */
  findLearnedPacking(signature: string): Promise<{
    cover: string;
    materials: Array<{ code: string; label: string }>;
    note: string | null;
  } | null>;
  listPartnerStockBySkuHint(title: string): Promise<
    Array<{ partnerCode: string; partnerName: string; locationCode: string; qty: number }>
  >;
}
