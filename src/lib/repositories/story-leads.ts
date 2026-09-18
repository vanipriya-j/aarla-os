import type {
  CreateStoryLeadInput,
  StoryLeadDetail,
  StoryLeadListFilters,
  StoryLeadRecord,
  UpdateStoryLeadInput,
} from "@/lib/domain/story-lead-types";

export interface StoryLeadsRepository {
  /**
   * Insert lead; on duplicate idempotency_key return the existing row
   * with created=false (same lead, not a second one).
   */
  upsertByIdempotencyKey(input: CreateStoryLeadInput): Promise<StoryLeadRecord>;
  findById(id: string): Promise<StoryLeadDetail | null>;
  list(filters?: StoryLeadListFilters): Promise<StoryLeadRecord[]>;
  update(id: string, input: UpdateStoryLeadInput): Promise<StoryLeadDetail>;
  setShopifyDraftOrder(
    id: string,
    draft: {
      draftOrderId: string | null;
      draftOrderName: string | null;
      draftOrderUrl: string | null;
      error: string | null;
    },
  ): Promise<StoryLeadDetail>;
}
