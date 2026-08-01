export const CREATIVE_NODE_TYPES = [
  "idea",
  "observation",
  "world",
  "theme",
  "concept",
  "collection",
  "object",
  "product-opportunity",
  "product",
  "motif",
  "symbol",
  "material",
  "story",
  "content-concept",
  "research-topic",
  "occasion",
  "campaign",
  "collaboration",
  "person",
  "place",
] as const;

export type CreativeNodeType = (typeof CREATIVE_NODE_TYPES)[number];

export const LIFECYCLE_STATUSES = [
  "captured",
  "exploring",
  "researching",
  "developing",
  "ready",
  "active",
  "paused",
  "archived",
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const MATURITY_STATUSES = ["seed", "emerging", "developed", "established"] as const;
export type MaturityStatus = (typeof MATURITY_STATUSES)[number];

export const RELATIONSHIP_TYPES = [
  "belongs-to",
  "inspired-by",
  "related-to",
  "can-become",
  "fits-with",
  "uses",
  "made-of",
  "suitable-for",
  "tells-story-of",
  "featured-in",
  "manufactured-by",
  "located-in",
  "researched-through",
  "collaborates-with",
  "part-of",
  "predecessor-of",
  "successor-of",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export type RelationshipStatus = "established" | "inferred" | "suggested" | "rejected";
export type RelationshipSource =
  | "founder-confirmed"
  | "existing-data"
  | "rule-based"
  | "AI-suggested"
  | "imported"
  | "seed";

export type NodeSource = "founder" | "seed" | "imported" | "ai-suggested" | "rule-based";

export interface CreativeNode {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  description: string;
  nodeTypes: CreativeNodeType[];
  lifecycleStatus: LifecycleStatus;
  maturityStatus: MaturityStatus;
  isFuture: boolean;
  confidence: number;
  source: NodeSource;
  createdBy: string;
  notes: string;
  opportunityPayload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeRelationship {
  id: string;
  organizationId: string;
  fromNodeId: string;
  toNodeId: string;
  relationshipType: RelationshipType;
  affinityScore: number;
  relationshipStatus: RelationshipStatus;
  explanation: string;
  evidence: string[];
  source: RelationshipSource;
  confirmedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeNodeAlias {
  id: string;
  organizationId: string;
  nodeId: string;
  alias: string;
}

export interface CreativeNodeNote {
  id: string;
  organizationId: string;
  nodeId: string;
  body: string;
  createdBy: string;
  createdAt: string;
}

export interface CreativeNodeAsset {
  id: string;
  organizationId: string;
  nodeId: string;
  kind: string;
  url: string;
  caption: string;
  createdAt: string;
}

export interface CreativeEvent {
  id: string;
  organizationId: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  actor: string;
  source: string;
  previousValue?: unknown;
  newValue?: unknown;
  reasoning?: string | null;
  createdAt: string;
}

export interface AffinityFactor {
  code: string;
  label: string;
  weight: number;
}

export interface AffinityResult {
  node: CreativeNode;
  relationship: CreativeRelationship;
  score: number;
  explanation: string;
  factors: AffinityFactor[];
  category: AffinityCategory;
}

export type AffinityCategory =
  | "Worlds"
  | "Concepts"
  | "Collections"
  | "Objects"
  | "Stories / Content"
  | "Research"
  | "People / Places"
  | "Other";

export interface ExploreUniverseResult {
  query: string;
  center: CreativeNode;
  created: boolean;
  affinities: AffinityResult[];
  byCategory: Record<AffinityCategory, AffinityResult[]>;
  suggestedNewNodes: { title: string; nodeTypes: CreativeNodeType[]; rationale: string }[];
}

export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function categorizeNode(node: CreativeNode): AffinityCategory {
  const types = new Set(node.nodeTypes);
  if (types.has("world") || types.has("theme")) return "Worlds";
  if (types.has("concept")) return "Concepts";
  if (types.has("collection") || types.has("campaign") || types.has("occasion")) {
    return "Collections";
  }
  if (
    types.has("object") ||
    types.has("product-opportunity") ||
    types.has("product") ||
    types.has("motif") ||
    types.has("symbol") ||
    types.has("material")
  ) {
    return "Objects";
  }
  if (types.has("story") || types.has("content-concept")) return "Stories / Content";
  if (types.has("research-topic")) return "Research";
  if (types.has("person") || types.has("place") || types.has("collaboration")) {
    return "People / Places";
  }
  return "Other";
}
