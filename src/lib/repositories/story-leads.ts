import type {
  CreateStoryLeadInput,
  StoryLeadRecord,
} from "@/lib/domain/story-lead-types";

export interface StoryLeadsRepository {
  /**
   * Insert lead; on duplicate idempotency_key return the existing row
   * with created=false (same lead, not a second one).
   */
  upsertByIdempotencyKey(input: CreateStoryLeadInput): Promise<StoryLeadRecord>;
  findById(id: string): Promise<StoryLeadRecord | null>;
}
