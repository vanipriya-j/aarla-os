import type {
  CommerceCustomerDiagnostic,
  CommerceProvider,
  ExternalCustomer,
  ExternalFulfilment,
  ExternalOrder,
  ExternalOrderItem,
  OrderExclusionReason,
} from "@/lib/domain/external-commerce-types";

export type UpsertCustomerInput = {
  provider: CommerceProvider;
  externalId: string;
  name: string;
  phone: string | null;
  email: string | null;
  marketingConsentStatus: string | null;
};

export type UpsertOrderInput = {
  provider: CommerceProvider;
  externalId: string;
  orderNumber: string;
  externalCustomerExternalId: string | null;
  orderDate: string;
  financialStatus: string | null;
  fulfilmentStatus: string | null;
  cancelledAt: string | null;
  isTest: boolean;
  isValid: boolean;
  exclusionReason: OrderExclusionReason | null;
  totalAmount: number;
  currency: string;
  contactPhone?: string | null;
  lineItems: Array<{
    externalLineItemId: string;
    externalProductId: string | null;
    externalVariantId: string | null;
    title: string;
    variantTitle: string | null;
    quantity: number;
    unitPrice: number;
  }>;
};

export type UpsertFulfilmentInput = {
  provider: CommerceProvider;
  externalId: string;
  orderExternalId: string;
  trackingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  fulfilmentStatus: string | null;
};

export type UpsertResult = { id: string; created: boolean };

export type UpsertAbandonedCheckoutInput = {
  provider: CommerceProvider;
  externalId: string;
  externalCustomerId: string | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  checkoutUrl: string | null;
  subtotal: number;
  currency: string;
  createdAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  lineItems: Array<{
    externalLineItemId: string;
    externalProductId: string | null;
    externalVariantId: string | null;
    title: string;
    variantTitle: string | null;
    quantity: number;
    unitPrice: number;
  }>;
};

export interface ExternalCommerceRepository {
  findCustomerByExternalId(
    provider: CommerceProvider,
    externalId: string,
  ): Promise<ExternalCustomer | null>;
  upsertCustomer(input: UpsertCustomerInput): Promise<UpsertResult>;
  setLatestValidOrderAt(
    provider: CommerceProvider,
    externalId: string,
    latestValidOrderAt: string | null,
  ): Promise<void>;
  upsertOrder(input: UpsertOrderInput): Promise<UpsertResult>;
  upsertFulfilment(input: UpsertFulfilmentInput): Promise<UpsertResult>;
  /** Ensure contact_phone column exists (safe if migration not recorded). */
  ensureOrderContactPhoneSchema(): Promise<void>;
  /** Delivered orders still missing both customer + order phone. */
  listDeliveredOrdersMissingPhone(limit?: number): Promise<
    Array<{ orderNumber: string; customerExternalId: string }>
  >;
  /** Patch phones without re-writing line items. */
  applyContactPhone(input: {
    provider: CommerceProvider;
    orderExternalId: string;
    customerExternalId: string | null;
    phone: string;
  }): Promise<{ orderUpdated: boolean; customerUpdated: boolean }>;
  listCustomers(): Promise<ExternalCustomer[]>;
  listOrdersForCustomer(customerId: string): Promise<ExternalOrder[]>;
  listItemsForOrder(orderId: string): Promise<ExternalOrderItem[]>;
  listFulfilmentsForOrder(orderId: string): Promise<ExternalFulfilment[]>;
  countOrdersByExternalId(provider: CommerceProvider, externalId: string): Promise<number>;
  countCustomers(): Promise<number>;
  diagnostics(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<{
    rows: CommerceCustomerDiagnostic[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;
  /** Integrity helpers for sync tests — do not expose PII dumps. */
  countInteractionsForExternalCustomer(externalCustomerId: string): Promise<number>;
  isDoNotContact(externalCustomerId: string): Promise<boolean>;
  /** Ensure abandoned-checkout tables exist (safe if migration not recorded). */
  ensureAbandonedCheckoutSchema(): Promise<void>;
  /** Upsert an abandoned checkout + replace its line items. */
  upsertAbandonedCheckout(input: UpsertAbandonedCheckoutInput): Promise<UpsertResult>;
}
