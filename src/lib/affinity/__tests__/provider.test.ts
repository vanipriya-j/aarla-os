import { describe, expect, it } from "vitest";
import { RuleBasedAffinitySuggestionProvider } from "../rule-based-provider";
import type { CreativeNode } from "@/lib/domain/creative-types";

describe("RuleBasedAffinitySuggestionProvider", () => {
  it("never allows auto-commit", async () => {
    const provider = new RuleBasedAffinitySuggestionProvider();
    const source: CreativeNode = {
      id: "a",
      organizationId: "o",
      title: "Temple Bell",
      slug: "temple-bell",
      description: "",
      nodeTypes: ["object"],
      lifecycleStatus: "active",
      maturityStatus: "established",
      isFuture: false,
      confidence: 1,
      source: "seed",
      createdBy: "seed",
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const world: CreativeNode = {
      ...source,
      id: "b",
      title: "Sacred Sounds",
      slug: "sacred-sounds",
      nodeTypes: ["world"],
    };
    const suggestions = await provider.suggest({
      source,
      nodes: [source, world],
      relationships: [],
    });
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.commitAllowed).toBe(false);
    }
  });
});
