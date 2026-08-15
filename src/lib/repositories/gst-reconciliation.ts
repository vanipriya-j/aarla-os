import type {
  GstAccountantPackMeta,
  GstPeriodStatus,
  GstSalesRow,
  OrganizationAccountantSettings,
  PurchaseBill,
  PurchaseBillReviewStatus,
  PurchaseBillSource,
  UpsertPurchaseBillInput,
} from "@/lib/domain/gst-types";

export type GstPeriodRow = {
  id: string;
  financialYear: string;
  month: number;
  status: GstPeriodStatus;
  exceptionCount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type GstEvidenceInsert = {
  filename: string;
  mimeType: string;
  content: Buffer;
  uploadedBy: string;
  extractionHints?: Record<string, unknown>;
};

export type GstEvidenceRow = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  uploadedBy: string;
  createdAt: string;
};

export type GstPackInsert = {
  periodId: string;
  version: number;
  generatedBy: string;
  exceptionCount: number;
  payloadJson: Record<string, unknown>;
  xlsxBytes: Buffer;
  xlsxFilename: string;
};

export type GstPackRow = GstAccountantPackMeta & {
  payloadJson: Record<string, unknown>;
};

export type GstSendInsert = {
  packId: string;
  periodId: string;
  recipient: string;
  sentBy: string;
  exceptionCount: number;
  channel?: "download_mark_sent" | "email";
};

export type GstLastSendRow = {
  recipient: string;
  sentAt: string;
  sentBy: string;
  packVersion: number;
  exceptionCount: number;
};

export type GstDuplicateCandidate = {
  id: string;
  vendorName: string;
  vendorGstin: string | null;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceTotal: number;
};

export type UpsertAccountantSettingsInput = {
  legalName: string;
  gstin: string;
  state: string;
  accountantName: string;
  accountantEmail: string;
  financialYearStartMonth?: number;
};

export interface GstReconciliationRepository {
  getAccountantSettings(): Promise<OrganizationAccountantSettings>;
  upsertAccountantSettings(
    input: UpsertAccountantSettingsInput,
  ): Promise<OrganizationAccountantSettings>;

  getOrCreatePeriod(financialYear: string, month: number): Promise<GstPeriodRow>;
  updatePeriodStatus(
    periodId: string,
    status: GstPeriodStatus,
    exceptionCount?: number,
  ): Promise<GstPeriodRow>;

  listPurchaseBillsInRange(
    startDateInclusive: string,
    endDateExclusive: string,
  ): Promise<PurchaseBill[]>;
  upsertPurchaseBill(input: UpsertPurchaseBillInput): Promise<PurchaseBill>;
  findDuplicateCandidates(input: {
    vendorGstin?: string | null;
    vendorName: string;
    invoiceNumber: string;
    excludeId?: string;
  }): Promise<GstDuplicateCandidate[]>;

  insertEvidence(input: GstEvidenceInsert): Promise<GstEvidenceRow>;

  listSalesForPeriod(
    startInstantIso: string,
    endExclusiveInstantIso: string,
  ): Promise<GstSalesRow[]>;

  listPacks(periodId: string): Promise<GstAccountantPackMeta[]>;
  insertPack(input: GstPackInsert): Promise<GstPackRow>;
  getPackBytes(packId: string): Promise<{
    id: string;
    filename: string;
    bytes: Buffer;
    periodId: string;
    version: number;
    exceptionCount: number;
  } | null>;
  insertSend(input: GstSendInsert): Promise<void>;
  getLastSend(periodId: string): Promise<GstLastSendRow | null>;
}

export type {
  PurchaseBill,
  PurchaseBillReviewStatus,
  PurchaseBillSource,
  OrganizationAccountantSettings,
  GstSalesRow,
  GstPeriodStatus,
};
