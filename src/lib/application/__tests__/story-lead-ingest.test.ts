import { describe, expect, it } from "vitest";
import { parseStoryLeadInboundBody } from "@/lib/application/story-lead-service";
import {
  storyLeadTypeForFormKey,
  STORY_MODULE,
} from "@/lib/domain/story-lead-types";

describe("story lead form mapping", () => {
  it("maps form_key to lead_type", () => {
    expect(storyLeadTypeForFormKey("tell_your_story")).toBe("tell_your_story");
    expect(storyLeadTypeForFormKey("become_a_merch_partner")).toBe("merch_partner");
    expect(storyLeadTypeForFormKey("book_a_discovery")).toBe("discovery");
    expect(storyLeadTypeForFormKey("upload_a_brief")).toBe("brief_upload");
  });
});

describe("parseStoryLeadInboundBody", () => {
  const base = {
    idempotency_key: "11111111-1111-4111-8111-111111111111",
    source: "gyvft",
    module: STORY_MODULE,
    form_key: "tell_your_story",
    submitted_at: "2026-09-18T10:00:00.000Z",
    contact: {
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+91 90000 00000",
      organisation_name: "Analytical Engines",
      designation: "Founder",
      preferred_contact_method: "whatsapp",
    },
    story: {
      description: "Teacher appreciation hampers",
      occasion_type: "institutional",
      audiences: ["teachers"],
      preferred_formats: ["hamper"],
      primary_city: "Chennai",
    },
    consent: { communication: true, marketing: false },
    attribution: {
      landing_page: "https://gyvft.vercel.app/tell",
      utm_source: "instagram",
    },
    ignored_future_field: { nested: true },
  };

  it("accepts a valid payload and ignores unknown fields", () => {
    const parsed = parseStoryLeadInboundBody(base);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input.formKey).toBe("tell_your_story");
    expect(parsed.input.leadType).toBe("tell_your_story");
    expect(parsed.input.email).toBe("ada@example.com");
    expect(parsed.input.audiences).toEqual(["teachers"]);
    expect(parsed.input.consentCommunication).toBe(true);
    expect(parsed.input.utmSource).toBe("instagram");
  });

  it("rejects missing contact and bad form_key", () => {
    const parsed = parseStoryLeadInboundBody({
      idempotency_key: "k",
      form_key: "nope",
      contact: { full_name: "", email: "bad" },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.body.code).toBe("validation_error");
    expect(parsed.body.fields?.form_key).toBeTruthy();
    expect(parsed.body.fields?.["contact.full_name"]).toBeTruthy();
    expect(parsed.body.fields?.["contact.email"]).toBeTruthy();
  });

  it("rejects attachment unless upload_a_brief", () => {
    const parsed = parseStoryLeadInboundBody({
      ...base,
      attachment: {
        filename: "brief.pdf",
        content_type: "application/pdf",
        content_base64: Buffer.from("hello").toString("base64"),
      },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.body.fields?.attachment).toMatch(/upload_a_brief/);
  });

  it("accepts attachment for upload_a_brief", () => {
    const parsed = parseStoryLeadInboundBody({
      ...base,
      form_key: "upload_a_brief",
      attachment: {
        filename: "brief.pdf",
        content_type: "application/pdf",
        content_base64: Buffer.from("hello").toString("base64"),
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input.leadType).toBe("brief_upload");
    expect(parsed.input.attachment?.filename).toBe("brief.pdf");
    expect(parsed.input.attachment?.byteSize).toBe(5);
  });
});
