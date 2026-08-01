import { describe, expect, it } from "vitest";
import { buildAffinityResults, groupByCategory, matchNodeByTitleOrAlias } from "../affinity";
import type { CreativeNode, CreativeRelationship } from "../creative-types";

function node(partial: Partial<CreativeNode> & Pick<CreativeNode, "id" | "title" | "nodeTypes">): CreativeNode {
  return {
    organizationId: "org",
    slug: partial.title.toLowerCase().replace(/\s+/g, "-"),
    description: "",
    lifecycleStatus: "captured",
    maturityStatus: "seed",
    isFuture: true,
    confidence: 1,
    source: "seed",
    createdBy: "seed",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("affinity helpers", () => {
  const temple = node({
    id: "1",
    title: "Temple Bell",
    nodeTypes: ["object", "symbol"],
    isFuture: false,
  });
  const drishti = node({
    id: "2",
    title: "Drishti",
    nodeTypes: ["concept"],
    isFuture: true,
    lifecycleStatus: "exploring",
    maturityStatus: "emerging",
  });
  const rel: CreativeRelationship = {
    id: "r1",
    organizationId: "org",
    fromNodeId: "1",
    toNodeId: "2",
    relationshipType: "related-to",
    affinityScore: 86,
    relationshipStatus: "suggested",
    explanation:
      "Connected through ritual protection, thresholds, auspicious sound, brass objects and the act of marking a transition into sacred space.",
    evidence: [],
    source: "rule-based",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("includes explanation with affinity score", () => {
    const results = buildAffinityResults(temple, [temple, drishti], [rel]);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThanOrEqual(86);
    expect(results[0].explanation).toMatch(/ritual protection/i);
    expect(results[0].category).toBe("Concepts");
  });

  it("groups by category", () => {
    const grouped = groupByCategory(buildAffinityResults(temple, [temple, drishti], [rel]));
    expect(grouped.Concepts).toHaveLength(1);
  });

  it("matches aliases", () => {
    const hit = matchNodeByTitleOrAlias("Ghanta", [temple], [{ nodeId: "1", alias: "Ghanta" }]);
    expect(hit?.title).toBe("Temple Bell");
  });

  it("keeps Drishti as future concept", () => {
    expect(drishti.isFuture).toBe(true);
    expect(drishti.nodeTypes).toContain("concept");
  });
});
