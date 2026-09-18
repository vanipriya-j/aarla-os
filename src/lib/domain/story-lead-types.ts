/**
 * Your Story. Our Telling. — inbound lead types (GYVFT public forms + Aarla CRM).
 */

export const STORY_MODULE = "your_story_our_telling" as const;

export const STORY_FORM_KEYS = [
  "tell_your_story",
  "become_a_merch_partner",
  "book_a_discovery",
  "upload_a_brief",
] as const;
export type StoryFormKey = (typeof STORY_FORM_KEYS)[number];

export const STORY_LEAD_TYPES = [
  "tell_your_story",
  "merch_partner",
  "discovery",
  "brief_upload",
] as const;
export type StoryLeadType = (typeof STORY_LEAD_TYPES)[number];

/**
 * Pipeline statuses. `converted`/`declined` are legacy aliases of won/lost
 * (kept so existing GYVFT rows remain valid).
 */
export const STORY_LEAD_STATUSES = [
  "new",
  "reviewed",
  "in_progress",
  "qualified",
  "proposal",
  "won",
  "lost",
  "converted",
  "declined",
  "archived",
] as const;
export type StoryLeadStatus = (typeof STORY_LEAD_STATUSES)[number];

/** Statuses shown in the CRM pipeline picker (excludes legacy aliases). */
export const STORY_LEAD_CRM_STATUSES = [
  "new",
  "reviewed",
  "in_progress",
  "qualified",
  "proposal",
  "won",
  "lost",
  "archived",
] as const;
export type StoryLeadCrmStatus = (typeof STORY_LEAD_CRM_STATUSES)[number];

export const STORY_LEAD_STATUS_LABELS: Record<StoryLeadStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  in_progress: "In Progress",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Closed Won",
  lost: "Closed Lost",
  converted: "Closed Won",
  declined: "Closed Lost",
  archived: "Archived",
};

export function normalizeStoryLeadStatus(status: StoryLeadStatus): StoryLeadCrmStatus {
  if (status === "converted") return "won";
  if (status === "declined") return "lost";
  return status;
}

export function isStoryLeadStatus(value: unknown): value is StoryLeadStatus {
  return (
    typeof value === "string" &&
    (STORY_LEAD_STATUSES as readonly string[]).includes(value)
  );
}

export function isClosedWonStatus(status: StoryLeadStatus): boolean {
  return status === "won" || status === "converted";
}

export function isClosedLostStatus(status: StoryLeadStatus): boolean {
  return status === "lost" || status === "declined";
}

export const STORY_PREFERRED_CONTACT_METHODS = [
  "email",
  "phone",
  "whatsapp",
] as const;
export type StoryPreferredContactMethod =
  (typeof STORY_PREFERRED_CONTACT_METHODS)[number];

/** Map public form_key → internal pipeline lead type. */
export function storyLeadTypeForFormKey(formKey: StoryFormKey): StoryLeadType {
  switch (formKey) {
    case "tell_your_story":
      return "tell_your_story";
    case "become_a_merch_partner":
      return "merch_partner";
    case "book_a_discovery":
      return "discovery";
    case "upload_a_brief":
      return "brief_upload";
    default: {
      const _exhaustive: never = formKey;
      return _exhaustive;
    }
  }
}

export function isStoryFormKey(value: unknown): value is StoryFormKey {
  return (
    typeof value === "string" &&
    (STORY_FORM_KEYS as readonly string[]).includes(value)
  );
}

export const STORY_FORM_KEY_LABELS: Record<StoryFormKey, string> = {
  tell_your_story: "Tell your story",
  become_a_merch_partner: "Merch partner",
  book_a_discovery: "Discovery",
  upload_a_brief: "Brief upload",
};

export const STORY_LEAD_TYPE_LABELS: Record<StoryLeadType, string> = {
  tell_your_story: "Tell your story",
  merch_partner: "Merch partner",
  discovery: "Discovery",
  brief_upload: "Brief upload",
};

export type StoryLeadContactInput = {
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  organisation_name?: unknown;
  designation?: unknown;
  preferred_contact_method?: unknown;
};

export type StoryLeadStoryInput = {
  description?: unknown;
  occasion_type?: unknown;
  audiences?: unknown;
  preferred_formats?: unknown;
  target_date?: unknown;
  quantity_range?: unknown;
  budget_range?: unknown;
  primary_city?: unknown;
  discussion_topic?: unknown;
  timeline?: unknown;
  additional_context?: unknown;
};

export type StoryLeadConsentInput = {
  communication?: unknown;
  marketing?: unknown;
};

export type StoryLeadAttributionInput = {
  landing_page?: unknown;
  referrer?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
};

export type StoryLeadAttachmentInput = {
  filename?: unknown;
  content_type?: unknown;
  content_base64?: unknown;
};

/** Wire body from GYVFT (unknown fields ignored). */
export type StoryLeadInboundBody = {
  idempotency_key?: unknown;
  source?: unknown;
  module?: unknown;
  form_key?: unknown;
  submitted_at?: unknown;
  contact?: StoryLeadContactInput | null;
  story?: StoryLeadStoryInput | null;
  consent?: StoryLeadConsentInput | null;
  attribution?: StoryLeadAttributionInput | null;
  attachment?: StoryLeadAttachmentInput | null;
};

export type StoryLeadAttachmentStored = {
  filename: string;
  contentType: string;
  bytes: Buffer;
  byteSize: number;
};

export type CreateStoryLeadInput = {
  idempotencyKey: string;
  source: string;
  module: typeof STORY_MODULE;
  formKey: StoryFormKey;
  leadType: StoryLeadType;
  submittedAt: string;
  fullName: string;
  email: string;
  phone: string | null;
  organisationName: string | null;
  designation: string | null;
  preferredContactMethod: StoryPreferredContactMethod | null;
  storyDescription: string | null;
  occasionType: string | null;
  audiences: string[];
  preferredFormats: string[];
  targetDate: string | null;
  quantityRange: string | null;
  budgetRange: string | null;
  primaryCity: string | null;
  discussionTopic: string | null;
  timeline: string | null;
  additionalContext: string | null;
  consentCommunication: boolean;
  consentMarketing: boolean;
  landingPage: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  attachment: StoryLeadAttachmentStored | null;
  rawPayload: unknown;
};

/** Slim list row for CRM table. */
export type StoryLeadRecord = {
  id: string;
  idempotencyKey: string;
  source: string;
  module: string;
  formKey: StoryFormKey;
  leadType: StoryLeadType;
  status: StoryLeadStatus;
  submittedAt: string;
  fullName: string;
  email: string;
  phone: string | null;
  organisationName: string | null;
  primaryCity: string | null;
  occasionType: string | null;
  quantityRange: string | null;
  budgetRange: string | null;
  notes: string;
  shopifyDraftOrderId: string | null;
  shopifyDraftOrderName: string | null;
  shopifyDraftOrderUrl: string | null;
  shopifyOrderError: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  created: boolean;
};

/** Full detail for CRM edit / won flow. */
export type StoryLeadDetail = StoryLeadRecord & {
  designation: string | null;
  preferredContactMethod: StoryPreferredContactMethod | null;
  storyDescription: string | null;
  audiences: string[];
  preferredFormats: string[];
  targetDate: string | null;
  discussionTopic: string | null;
  timeline: string | null;
  additionalContext: string | null;
  consentCommunication: boolean;
  consentMarketing: boolean;
  landingPage: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  attachmentFilename: string | null;
  attachmentContentType: string | null;
  attachmentByteSize: number | null;
  lostReason: string | null;
};

export type StoryLeadListFilters = {
  status?: StoryLeadStatus | "open" | "closed" | "all";
  formKey?: StoryFormKey | "all";
  source?: string | "all";
  q?: string;
  limit?: number;
};

export type UpdateStoryLeadInput = {
  status?: StoryLeadStatus;
  fullName?: string;
  email?: string;
  phone?: string | null;
  organisationName?: string | null;
  designation?: string | null;
  preferredContactMethod?: StoryPreferredContactMethod | null;
  storyDescription?: string | null;
  occasionType?: string | null;
  audiences?: string[];
  preferredFormats?: string[];
  targetDate?: string | null;
  quantityRange?: string | null;
  budgetRange?: string | null;
  primaryCity?: string | null;
  discussionTopic?: string | null;
  timeline?: string | null;
  additionalContext?: string | null;
  notes?: string;
  lostReason?: string | null;
};

export type StoryLeadShopifyDraftResult = {
  draftOrderId: string | null;
  draftOrderName: string | null;
  draftOrderUrl: string | null;
  error: string | null;
  softFailed: boolean;
};

/** Max decoded attachment size (5 MiB). */
export const STORY_LEAD_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
