import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreativeEngine } from "@/lib/engine/creative-engine";
import { createCreativeUnitOfWork } from "@/lib/infra/repositories/postgres-creative";
import { closePool } from "@/lib/infra/db/pool";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("Aarla Universe creative engine", () => {
  const engine = () => new CreativeEngine(createCreativeUnitOfWork());

  beforeAll(async () => {
    // Ensure seeded graph exists for Temple Bell / Drishti.
    const uow = createCreativeUnitOfWork();
    const nodes = await uow.nodes.list();
    if (!nodes.some((n) => n.slug === "temple-bell")) {
      throw new Error("Universe seed missing — run npm run db:migrate && npm run db:seed");
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it("creates unclassified future idea", async () => {
    const node = await engine().createNode({
      title: `Rain thought ${Date.now()}`,
      saveUnclassified: true,
    });
    expect(node.nodeTypes).toEqual(["idea"]);
    expect(node.isFuture).toBe(true);
    expect(node.lifecycleStatus).toBe("captured");
  });

  it("creates multi-type node", async () => {
    const node = await engine().createNode({
      title: `Multi ${Date.now()}`,
      nodeTypes: ["object", "symbol", "motif"],
      isFuture: true,
    });
    expect(node.nodeTypes).toEqual(expect.arrayContaining(["object", "symbol", "motif"]));
  });

  it("Temple Bell returns several affinity categories", async () => {
    const result = await engine().explore("Temple Bell");
    expect(result.center.slug).toBe("temple-bell");
    const cats = new Set(result.affinities.map((a) => a.category));
    expect(cats.size).toBeGreaterThanOrEqual(4);
    expect(result.affinities.every((a) => a.explanation.trim().length > 0)).toBe(true);
  });

  it("connects to world and future concept; confirm/reject", async () => {
    const result = await engine().explore("Temple Bell");
    const world = result.affinities.find((a) => a.category === "Worlds");
    const drishti = result.affinities.find((a) => a.node.slug === "drishti");
    expect(world).toBeTruthy();
    expect(drishti?.node.isFuture).toBe(true);
    expect(drishti?.node.nodeTypes).toContain("concept");

    if (drishti && drishti.relationship.relationshipStatus !== "established") {
      const confirmed = await engine().confirmRelationship(drishti.relationship.id);
      expect(confirmed.relationshipStatus).toBe("established");
      expect(confirmed.source).toBe("founder-confirmed");
    }

    const suggested = result.affinities.find(
      (a) => a.relationship.relationshipStatus === "suggested" && a.node.slug !== "drishti",
    );
    if (suggested) {
      const rejected = await engine().rejectRelationship(suggested.relationship.id);
      expect(rejected.relationshipStatus).toBe("rejected");
    }
  });

  it("creates content concept and product opportunity from node", async () => {
    const center = await engine().explore("Temple Bell");
    const content = await engine().createContentConcept({
      fromNodeId: center.center.id,
      workingTitle: `Science behind temple bells ${Date.now()}`,
      angle: "Acoustics and ritual",
      isFuture: true,
    });
    expect(content.node.nodeTypes).toContain("content-concept");

    const product = await engine().createProductOpportunity({
      fromNodeId: center.center.id,
      title: `Small Brass Bell ${Date.now()}`,
      material: "Brass",
      isFuture: true,
    });
    expect(product.node.nodeTypes).toEqual(
      expect.arrayContaining(["object", "product-opportunity"]),
    );

    const detail = await engine().getNodeDetail(center.center.id);
    expect(detail?.affinities.some((a) => a.node.id === content.node.id)).toBe(true);
    expect(detail?.affinities.some((a) => a.node.id === product.node.id)).toBe(true);
  });

  it("AI suggestions never auto-commit without founder confirmation", async () => {
    const { RuleBasedAffinitySuggestionProvider } = await import(
      "@/lib/affinity/rule-based-provider"
    );
    const provider = new RuleBasedAffinitySuggestionProvider();
    const uow = createCreativeUnitOfWork();
    const nodes = await uow.nodes.list();
    const source = nodes.find((n) => n.slug === "temple-bell")!;
    const suggestions = await provider.suggest({
      source,
      nodes,
      relationships: await uow.relationships.list(),
    });
    expect(suggestions.every((s) => s.commitAllowed === false)).toBe(true);
  });
});
