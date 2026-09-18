import { describe, expect, it, vi } from "vitest";
import {
  normalizeStoryLeadStatus,
  STORY_LEAD_STATUS_LABELS,
  type StoryLeadDetail,
} from "@/lib/domain/story-lead-types";
import { storyLeadManufactureHref } from "@/lib/domain/story-lead-manufacture-link";

describe("story lead CRM status", () => {
  it("maps legacy converted/declined to won/lost", () => {
    expect(normalizeStoryLeadStatus("converted")).toBe("won");
    expect(normalizeStoryLeadStatus("declined")).toBe("lost");
    expect(normalizeStoryLeadStatus("qualified")).toBe("qualified");
  });

  it("labels closed statuses clearly", () => {
    expect(STORY_LEAD_STATUS_LABELS.won).toBe("Closed Won");
    expect(STORY_LEAD_STATUS_LABELS.converted).toBe("Closed Won");
    expect(STORY_LEAD_STATUS_LABELS.lost).toBe("Closed Lost");
  });
});

describe("storyLeadManufactureHref", () => {
  it("builds a needs-making deep link with label and qty", () => {
    const href = storyLeadManufactureHref({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      fullName: "Ada",
      organisationName: "Analytical Engines",
      occasionType: "Teacher day",
      quantityRange: "50-100",
    });
    expect(href).toContain("/manufacture/needs?");
    expect(href).toContain("qty=100");
    expect(href).toContain("label=");
    expect(href).toContain("aaaaaaaa");
  });
});

describe("markStoryLeadWon soft-fail", () => {
  it("marks won even when Shopify is unavailable", async () => {
    const detail: StoryLeadDetail = {
      id: "lead-1",
      idempotencyKey: "k",
      source: "gyvft",
      module: "your_story_our_telling",
      formKey: "tell_your_story",
      leadType: "tell_your_story",
      status: "in_progress",
      submittedAt: "2026-09-18T10:00:00.000Z",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: null,
      organisationName: "AE",
      primaryCity: "Chennai",
      occasionType: "institutional",
      quantityRange: "100",
      budgetRange: "1500",
      notes: "",
      shopifyDraftOrderId: null,
      shopifyDraftOrderName: null,
      shopifyDraftOrderUrl: null,
      shopifyOrderError: null,
      closedAt: null,
      createdAt: "2026-09-18T10:00:00.000Z",
      updatedAt: "2026-09-18T10:00:00.000Z",
      created: false,
      designation: null,
      preferredContactMethod: null,
      storyDescription: "Hampers",
      audiences: [],
      preferredFormats: [],
      targetDate: null,
      discussionTopic: null,
      timeline: null,
      additionalContext: null,
      consentCommunication: true,
      consentMarketing: false,
      landingPage: null,
      referrer: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      attachmentFilename: null,
      attachmentContentType: null,
      attachmentByteSize: null,
      lostReason: null,
    };

    const repo = {
      upsertByIdempotencyKey: vi.fn(),
      findById: vi.fn(async () => detail),
      list: vi.fn(),
      update: vi.fn(async (_id: string, input: { status?: string }) => ({
        ...detail,
        status: (input.status ?? detail.status) as StoryLeadDetail["status"],
        closedAt: "2026-09-18T12:00:00.000Z",
      })),
      setShopifyDraftOrder: vi.fn(
        async (
          _id: string,
          draft: {
            draftOrderId: string | null;
            draftOrderName: string | null;
            draftOrderUrl: string | null;
            error: string | null;
          },
        ) => ({
          ...detail,
          status: "won" as const,
          shopifyDraftOrderId: draft.draftOrderId,
          shopifyDraftOrderName: draft.draftOrderName,
          shopifyDraftOrderUrl: draft.draftOrderUrl,
          shopifyOrderError: draft.error,
        }),
      ),
    };

    const { markStoryLeadWon } = await import(
      "@/lib/application/story-lead-service"
    );
    const result = await markStoryLeadWon("lead-1", {}, { repo, shopify: null });
    expect(result.lead.status).toBe("won");
    expect(result.shopify.softFailed).toBe(true);
    expect(result.shopify.error).toMatch(/Shopify credentials missing/i);
  });
});
