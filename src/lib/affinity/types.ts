import type {
  AffinityFactor,
  CreativeNode,
  CreativeRelationship,
  RelationshipType,
} from "@/lib/domain/creative-types";

/** Port for future LLM-based suggestions. Must never auto-commit. */
export interface AffinitySuggestionProvider {
  suggest(input: {
    source: CreativeNode;
    nodes: CreativeNode[];
    relationships: CreativeRelationship[];
  }): Promise<AffinitySuggestion[]>;
}

export interface AffinitySuggestion {
  toNodeId?: string;
  proposedNewNode?: {
    title: string;
    nodeTypes: string[];
    description?: string;
  };
  relationshipType: RelationshipType;
  proposedScore: number;
  explanation: string;
  confidence: number;
  factors: AffinityFactor[];
  /** Always uncommitted until founder confirms. */
  commitAllowed: false;
}
