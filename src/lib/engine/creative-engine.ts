import {
  buildAffinityResults,
  groupByCategory,
  matchNodeByTitleOrAlias,
} from "@/lib/domain/affinity";
import type {
  CreativeNode,
  CreativeNodeType,
  ExploreUniverseResult,
  LifecycleStatus,
  MaturityStatus,
} from "@/lib/domain/creative-types";
import type { AffinitySuggestionProvider } from "@/lib/affinity/types";
import { RuleBasedAffinitySuggestionProvider } from "@/lib/affinity/rule-based-provider";
import type { CreativeUnitOfWork } from "@/lib/repositories/creative";

export class CreativeEngine {
  constructor(
    private readonly uow: CreativeUnitOfWork,
    private readonly suggestions: AffinitySuggestionProvider = new RuleBasedAffinitySuggestionProvider(),
  ) {}

  async explore(query: string): Promise<ExploreUniverseResult> {
    const trimmed = query.trim();
    if (!trimmed) throw new Error("Enter an idea to explore.");

    const nodes = await this.uow.nodes.list();
    const aliases = await this.uow.aliases.list();
    let center = matchNodeByTitleOrAlias(trimmed, nodes, aliases);
    let created = false;

    if (!center) {
      center = await this.uow.nodes.create({
        title: trimmed,
        description: `Captured from Explore: ${trimmed}`,
        nodeTypes: ["idea"],
        lifecycleStatus: "captured",
        maturityStatus: "seed",
        isFuture: true,
        source: "founder",
      });
      created = true;
      await this.uow.events.append({
        eventType: "Idea Captured",
        entityType: "creative_node",
        entityId: center.id,
        actor: "founder",
        source: "founder",
        newValue: { title: center.title, nodeTypes: center.nodeTypes },
        reasoning: "Saved without immediate classification.",
      });
      nodes.push(center);
    }

    const relationships = await this.uow.relationships.listForNode(center.id);
    let affinities = buildAffinityResults(center, nodes, relationships);

    // Soft suggestions (never auto-committed)
    if (affinities.length < 3) {
      const proposals = await this.suggestions.suggest({
        source: center,
        nodes,
        relationships: await this.uow.relationships.list(),
      });
      for (const p of proposals) {
        if (!p.toNodeId || p.commitAllowed !== false) continue;
        const existing = relationships.find(
          (r) =>
            (r.fromNodeId === center!.id && r.toNodeId === p.toNodeId) ||
            (r.toNodeId === center!.id && r.fromNodeId === p.toNodeId),
        );
        if (existing) continue;
        const rel = await this.uow.relationships.create({
          fromNodeId: center.id,
          toNodeId: p.toNodeId,
          relationshipType: p.relationshipType,
          affinityScore: p.proposedScore,
          explanation: p.explanation,
          evidence: p.factors.map((f) => f.label),
          relationshipStatus: "suggested",
          source: "rule-based",
        });
        await this.uow.events.append({
          eventType: "Relationship Suggested",
          entityType: "creative_relationship",
          entityId: rel.id,
          actor: "system",
          source: "rule-based",
          newValue: { score: rel.affinityScore, toNodeId: p.toNodeId },
          reasoning: p.explanation,
        });
      }
      const refreshed = await this.uow.relationships.listForNode(center.id);
      affinities = buildAffinityResults(center, nodes, refreshed);
    }

    const suggestedNewNodes = defaultOpportunitySuggestions(center, affinities);

    return {
      query: trimmed,
      center,
      created,
      affinities,
      byCategory: groupByCategory(affinities),
      suggestedNewNodes,
    };
  }

  async createNode(input: {
    title: string;
    description?: string;
    nodeTypes?: CreativeNodeType[];
    lifecycleStatus?: LifecycleStatus;
    maturityStatus?: MaturityStatus;
    isFuture?: boolean;
    notes?: string;
    saveUnclassified?: boolean;
    relatedNodeId?: string;
    relationshipType?: Parameters<CreativeUnitOfWork["relationships"]["create"]>[0]["relationshipType"];
    affinityScore?: number;
    explanation?: string;
  }): Promise<CreativeNode> {
    const nodeTypes = input.saveUnclassified
      ? (["idea"] as CreativeNodeType[])
      : input.nodeTypes?.length
        ? input.nodeTypes
        : (["idea"] as CreativeNodeType[]);

    const node = await this.uow.nodes.create({
      title: input.title,
      description: input.description,
      nodeTypes,
      lifecycleStatus: input.saveUnclassified ? "captured" : (input.lifecycleStatus ?? "captured"),
      maturityStatus: input.maturityStatus ?? "seed",
      isFuture: input.isFuture ?? true,
      notes: input.notes,
      source: "founder",
    });

    await this.uow.events.append({
      eventType: "Node Created",
      entityType: "creative_node",
      entityId: node.id,
      actor: "founder",
      source: "founder",
      newValue: { title: node.title, nodeTypes: node.nodeTypes, isFuture: node.isFuture },
    });

    if (input.relatedNodeId && input.explanation) {
      const rel = await this.uow.relationships.create({
        fromNodeId: input.relatedNodeId,
        toNodeId: node.id,
        relationshipType: input.relationshipType ?? "related-to",
        affinityScore: input.affinityScore ?? 80,
        explanation: input.explanation,
        relationshipStatus: "established",
        source: "founder-confirmed",
        confirmedBy: "founder",
      });
      await this.uow.events.append({
        eventType: "Relationship Confirmed",
        entityType: "creative_relationship",
        entityId: rel.id,
        actor: "founder",
        source: "founder",
        newValue: { toNodeId: node.id, score: rel.affinityScore },
        reasoning: input.explanation,
      });
    }

    return node;
  }

  async confirmRelationship(id: string) {
    const rel = await this.uow.relationships.updateStatus(id, "established", "founder");
    await this.uow.events.append({
      eventType: "Relationship Confirmed",
      entityType: "creative_relationship",
      entityId: rel.id,
      actor: "founder",
      source: "founder",
      newValue: { status: "established" },
    });
    return rel;
  }

  async rejectRelationship(id: string) {
    const rel = await this.uow.relationships.updateStatus(id, "rejected", "founder");
    await this.uow.events.append({
      eventType: "Relationship Rejected",
      entityType: "creative_relationship",
      entityId: rel.id,
      actor: "founder",
      source: "founder",
      newValue: { status: "rejected" },
    });
    return rel;
  }

  async adjustAffinity(id: string, score: number, explanation: string) {
    return this.uow.relationships.updateAffinity(id, score, explanation);
  }

  async createContentConcept(input: {
    fromNodeId: string;
    workingTitle: string;
    angle?: string;
    audience?: string;
    format?: string;
    researchRequired?: string;
    peopleToInterview?: string;
    placesToVisit?: string;
    status?: LifecycleStatus;
    isFuture?: boolean;
  }) {
    const node = await this.uow.nodes.create({
      title: input.workingTitle,
      description: input.angle ?? "",
      nodeTypes: ["content-concept"],
      lifecycleStatus: input.status ?? "captured",
      maturityStatus: "seed",
      isFuture: input.isFuture ?? true,
      opportunityPayload: {
        kind: "content-concept",
        angle: input.angle ?? "",
        audience: input.audience ?? "",
        format: input.format ?? "",
        researchRequired: input.researchRequired ?? "",
        peopleToInterview: input.peopleToInterview ?? "",
        placesToVisit: input.placesToVisit ?? "",
      },
      source: "founder",
    });
    const from = await this.uow.nodes.getById(input.fromNodeId);
    const rel = await this.uow.relationships.create({
      fromNodeId: input.fromNodeId,
      toNodeId: node.id,
      relationshipType: "tells-story-of",
      affinityScore: 88,
      explanation: `Content concept developed from ${from?.title ?? "source node"}: ${input.angle || input.workingTitle}.`,
      relationshipStatus: "established",
      source: "founder-confirmed",
      confirmedBy: "founder",
    });
    await this.uow.events.append({
      eventType: "Content Concept Created",
      entityType: "creative_node",
      entityId: node.id,
      actor: "founder",
      source: "founder",
      newValue: { title: node.title, fromNodeId: input.fromNodeId, relationshipId: rel.id },
    });
    return { node, relationship: rel };
  }

  async createProductOpportunity(input: {
    fromNodeId: string;
    title: string;
    object?: string;
    proposedProductType?: string;
    world?: string;
    concept?: string;
    collection?: string;
    material?: string;
    targetAudience?: string;
    targetPrice?: number;
    possibleVendor?: string;
    indicativeMoq?: number;
    indicativeUnitCost?: number;
    estimatedCapital?: number;
    status?: LifecycleStatus;
    isFuture?: boolean;
  }) {
    const node = await this.uow.nodes.create({
      title: input.title,
      description: input.proposedProductType ?? "",
      nodeTypes: ["object", "product-opportunity"],
      lifecycleStatus: input.status ?? "captured",
      maturityStatus: "seed",
      isFuture: input.isFuture ?? true,
      opportunityPayload: {
        kind: "product-opportunity",
        object: input.object ?? input.title,
        proposedProductType: input.proposedProductType ?? "",
        world: input.world ?? "",
        concept: input.concept ?? "",
        collection: input.collection ?? "",
        material: input.material ?? "",
        targetAudience: input.targetAudience ?? "",
        targetPrice: input.targetPrice ?? null,
        possibleVendor: input.possibleVendor ?? "",
        indicativeMoq: input.indicativeMoq ?? null,
        indicativeUnitCost: input.indicativeUnitCost ?? null,
        estimatedCapital: input.estimatedCapital ?? null,
      },
      source: "founder",
    });
    const from = await this.uow.nodes.getById(input.fromNodeId);
    const rel = await this.uow.relationships.create({
      fromNodeId: input.fromNodeId,
      toNodeId: node.id,
      relationshipType: "can-become",
      affinityScore: 90,
      explanation: `${input.title} is a product opportunity emerging from ${from?.title ?? "the source idea"}.`,
      relationshipStatus: "established",
      source: "founder-confirmed",
      confirmedBy: "founder",
    });
    await this.uow.events.append({
      eventType: "Product Opportunity Created",
      entityType: "creative_node",
      entityId: node.id,
      actor: "founder",
      source: "founder",
      newValue: { title: node.title, fromNodeId: input.fromNodeId, relationshipId: rel.id },
    });
    return { node, relationship: rel };
  }

  async promoteTypes(nodeId: string, addTypes: CreativeNodeType[], markFuture?: boolean) {
    const node = await this.uow.nodes.getById(nodeId);
    if (!node) throw new Error("Node not found");
    const merged = Array.from(new Set([...node.nodeTypes, ...addTypes]));
    const updated = await this.uow.nodes.update(nodeId, {
      nodeTypes: merged,
      isFuture: markFuture ?? node.isFuture,
      lifecycleStatus: node.lifecycleStatus === "captured" ? "exploring" : node.lifecycleStatus,
    });
    await this.uow.events.append({
      eventType: addTypes.includes("concept") ? "Concept Created" : "Node Created",
      entityType: "creative_node",
      entityId: nodeId,
      actor: "founder",
      source: "founder",
      previousValue: { nodeTypes: node.nodeTypes },
      newValue: { nodeTypes: merged },
    });
    return updated;
  }

  async markFuture(nodeId: string, isFuture: boolean) {
    const prev = await this.uow.nodes.getById(nodeId);
    const updated = await this.uow.nodes.update(nodeId, { isFuture });
    await this.uow.events.append({
      eventType: "Node Marked Future",
      entityType: "creative_node",
      entityId: nodeId,
      actor: "founder",
      source: "founder",
      previousValue: { isFuture: prev?.isFuture },
      newValue: { isFuture },
    });
    return updated;
  }

  async addNote(nodeId: string, body: string) {
    return this.uow.notes.add(nodeId, body);
  }

  async getNodeDetail(nodeId: string) {
    const node = await this.uow.nodes.getById(nodeId);
    if (!node) return null;
    const allNodes = await this.uow.nodes.list();
    const relationships = await this.uow.relationships.listForNode(nodeId);
    const affinities = buildAffinityResults(node, allNodes, relationships);
    const notes = await this.uow.notes.listForNode(nodeId);
    const assets = await this.uow.assets.listForNode(nodeId);
    const events = await this.uow.events.listForEntity("creative_node", nodeId);
    return {
      node,
      affinities,
      byCategory: groupByCategory(affinities),
      notes,
      assets,
      events,
      relationships,
    };
  }

  async listFuture(filter?: CreativeNodeType | "unclassified") {
    const nodes = await this.uow.nodes.list();
    return nodes.filter((n) => {
      if (!n.isFuture && filter !== "unclassified") return false;
      if (!filter) return n.isFuture;
      if (filter === "unclassified") {
        return n.nodeTypes.length === 1 && n.nodeTypes[0] === "idea";
      }
      return n.isFuture && n.nodeTypes.includes(filter);
    });
  }
}

function defaultOpportunitySuggestions(
  center: CreativeNode,
  affinities: ReturnType<typeof buildAffinityResults>,
): ExploreUniverseResult["suggestedNewNodes"] {
  const title = center.title;
  const existing = new Set(affinities.map((a) => a.node.title.toLowerCase()));
  const candidates = [
    {
      title: `Small Brass ${title.includes("Bell") ? "Bell" : title}`,
      nodeTypes: ["object", "product-opportunity"] as CreativeNodeType[],
      rationale: `A tangible product opportunity derived from ${title}.`,
    },
    {
      title: `Why do we encounter ${title}?`,
      nodeTypes: ["content-concept"] as CreativeNodeType[],
      rationale: `Editorial content angle that teaches the cultural logic of ${title}.`,
    },
    {
      title: `${title} Research Notes`,
      nodeTypes: ["research-topic"] as CreativeNodeType[],
      rationale: `Place to gather metallurgy, ritual and place-based research around ${title}.`,
    },
  ];
  return candidates.filter((c) => !existing.has(c.title.toLowerCase()));
}
