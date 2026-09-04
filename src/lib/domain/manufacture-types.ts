/**
 * Manufacture / Reorder domain — Production Requirement → Vendor Order → Workflow → Receive.
 * The vendor order inside Aarla OS is the source of truth; WhatsApp/PDF are channels.
 */

export type ProductionRequirementSource =
  | "INVENTORY_REPLENISHMENT"
  | "CUSTOMER_ORDER"
  | "BULK_ORDER"
  | "CAMPAIGN"
  | "MANUAL"
  | "NEW_PRODUCT"
  | "PARTNER_REPLENISHMENT";

export type ProductionRequirementStatus =
  | "open"
  | "ordered"
  | "deferred"
  | "ignored"
  | "fulfilled";

export type VendorOrderStatus =
  | "draft"
  | "ready_to_send"
  | "sent"
  | "awaiting_confirmation"
  | "confirmed"
  | "in_production"
  | "awaiting_payment"
  | "awaiting_dispatch"
  | "in_transit"
  | "ready_to_receive"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";

export type WorkflowStepType =
  | "SEND_ORDER"
  | "AWAIT_CONFIRMATION"
  | "QUOTE_APPROVAL"
  | "ADVANCE_PAYMENT"
  | "ARTWORK_SHARE"
  | "MATERIAL_PROCUREMENT"
  | "PRODUCTION"
  | "VENDOR_QC"
  | "PHOTO_APPROVAL"
  | "BALANCE_PAYMENT"
  | "DISPATCH"
  | "TRANSIT"
  | "RECEIVE"
  | "AARLA_QC"
  | "INVENTORY_RECEIPT"
  | "CUSTOM";

export type WorkflowInstanceStepStatus =
  | "PENDING"
  | "ACTIVE"
  | "BLOCKED"
  | "AWAITING_VENDOR"
  | "AWAITING_AARLA"
  | "COMPLETED"
  | "SKIPPED"
  | "OVERDUE";

export type VendorCommChannel =
  | "WHATSAPP_MANUAL"
  | "WHATSAPP_API"
  | "EMAIL"
  | "DOWNLOAD"
  | "OTHER";

export interface MfgVendorProfile {
  id: string;
  name: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  city: string;
  address: string;
  gstin: string;
  category: string;
  whatTheyMake: string;
  categoriesSupported: string[];
  productsSupported: string[];
  moq: number;
  leadTimeDays: number;
  statedLeadTimeDays: number | null;
  internalBufferDays: number;
  paymentTerms: string;
  advancePercentage: number | null;
  preferredShippingMethod: string;
  notes: string;
  howTheyWork: string;
  active: boolean;
  qualityRating: number;
  workflowTemplateId: string | null;
  contact: string;
}

export interface WorkflowTemplateStep {
  id: string;
  sequence: number;
  name: string;
  stepType: WorkflowStepType;
  responsibility: "aarla" | "vendor" | "either";
  required: boolean;
  paymentPercentage: number | null;
  requiresApproval: boolean;
  requiresAttachment: boolean;
  requiresVendorConfirmation: boolean;
  updatesOrderStatus: string | null;
  notes: string;
}

export interface WorkflowTemplate {
  id: string;
  code: string;
  name: string;
  vendorId: string | null;
  sourceDescription: string;
  vendorLeadTimeDays: number | null;
  internalBufferDays: number;
  advancePercentage: number | null;
  status: "draft" | "approved" | "archived";
  steps: WorkflowTemplateStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductionRequirement {
  id: string;
  code: string;
  sourceType: ProductionRequirementSource;
  sourceId: string | null;
  productId: string;
  variantId: string | null;
  quantityRequired: number;
  quantityAlreadyAvailable: number;
  quantityToProduce: number;
  requiredByDate: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  reason: string;
  status: ProductionRequirementStatus;
  suggestedVendorId: string | null;
  transferSuggestion: {
    fromLocationId?: string;
    fromLocationName?: string;
    quantity?: number;
  } | null;
  vendorOrderId: string | null;
  createdAt: string;
}

export interface VendorOrderItem {
  id: string;
  lineNumber: number;
  productId: string;
  variantId: string | null;
  title: string;
  variantLabel: string;
  sku: string;
  quantity: number;
  unitCost: number | null;
  lineTotal: number | null;
  material: string;
  colour: string;
  sizeLabel: string;
  customisationInstructions: string;
  finishInstructions: string;
  artworkReference: string;
  notes: string;
  productionRequirementId: string | null;
}

export interface VendorOrder {
  id: string;
  orderNumber: string;
  vendorId: string;
  orderDate: string;
  status: VendorOrderStatus;
  currency: string;
  pricingStatus: "pending" | "partial" | "confirmed";
  subtotal: number | null;
  tax: number | null;
  shipping: number | null;
  total: number | null;
  advancePercentage: number | null;
  advanceAmount: number | null;
  balanceAmount: number | null;
  requestedDeliveryDate: string | null;
  vendorCommittedDate: string | null;
  internalExpectedDate: string | null;
  deliveryLocation: string;
  notes: string;
  workflowTemplateId: string | null;
  workflowInstanceId: string | null;
  items: VendorOrderItem[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowInstanceStep {
  id: string;
  sequence: number;
  name: string;
  stepType: WorkflowStepType;
  responsibility: string;
  status: WorkflowInstanceStepStatus;
  required: boolean;
  paymentPercentage: number | null;
  requiresApproval: boolean;
  requiresAttachment: boolean;
  startedAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  notes: string;
}

export interface WorkflowInstance {
  id: string;
  vendorOrderId: string;
  workflowTemplateId: string | null;
  status: "active" | "completed" | "cancelled";
  currentStepSequence: number | null;
  steps: WorkflowInstanceStep[];
}

export interface VendorOrderPdfVersion {
  id: string;
  vendorOrderId: string;
  versionNumber: number;
  generatedAt: string;
  generatedBy: string;
  sentAt: string | null;
  hasFile: boolean;
}

export interface VendorOrderCommunication {
  id: string;
  vendorOrderId: string;
  channel: VendorCommChannel;
  direction: "OUTBOUND" | "INBOUND";
  status: "SEND_INITIATED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  recipient: string;
  sender: string;
  message: string;
  pdfVersionId: string | null;
  createdAt: string;
}

export interface VendorPayment {
  id: string;
  vendorOrderId: string;
  stage: "ADVANCE" | "INTERIM" | "BALANCE" | "FULL" | "OTHER";
  amount: number;
  percentage: number | null;
  dueWhen: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string;
  reference: string;
  status: "due" | "paid" | "waived" | "cancelled";
}

export interface VendorWorkflowAiDraft {
  name: string;
  vendorLeadTimeDays: number | null;
  internalBufferDays: number;
  advancePercentage: number | null;
  steps: Array<{
    sequence: number;
    name: string;
    stepType: WorkflowStepType;
    responsibility: "aarla" | "vendor" | "either";
    required: boolean;
    paymentPercentage: number | null;
    requiresApproval: boolean;
    requiresAttachment: boolean;
    requiresVendorConfirmation: boolean;
    notes: string;
  }>;
  extractedRules: {
    vendorLeadTime: string | null;
    internalSafetyBuffer: string | null;
    advance: string | null;
    balance: string | null;
    proofRequired: string | null;
    inventoryUpdate: string | null;
  };
  source: "heuristic" | "llm";
}
