import type { AffinitySuggestion, AffinitySuggestionProvider } from "./types";
import { categorizeNode } from "@/lib/domain/creative-types";

/**
 * Rule-based suggestion provider. Never commits — commitAllowed is always false.
 * Placeholder boundary for a future LLM implementation.
 */
export class RuleBasedAffinitySuggestionProvider implements AffinitySuggestionProvider {
  async suggest(input: {
    source: Parameters<AffinitySuggestionProvider["suggest"]>[0]["source"];
    nodes: Parameters<AffinitySuggestionProvider["suggest"]>[0]["nodes"];
    relationships: Parameters<AffinitySuggestionProvider["suggest"]>[0]["relationships"];
  }): Promise<AffinitySuggestion[]> {
    const linked = new Set<string>();
    for (const r of input.relationships) {
      if (r.fromNodeId === input.source.id) linked.add(r.toNodeId);
      if (r.toNodeId === input.source.id) linked.add(r.fromNodeId);
    }

    const out: AffinitySuggestion[] = [];
    for (const node of input.nodes) {
      if (node.id === input.source.id || linked.has(node.id)) continue;
      if (node.nodeTypes.includes("world") && input.source.nodeTypes.includes("object")) {
        out.push({
          toNodeId: node.id,
          relationshipType: "belongs-to",
          proposedScore: 62,
          explanation: `${input.source.title} may belong in the ${node.title} world through shared cultural context (${categorizeNode(node)}).`,
          confidence: 0.45,
          factors: [{ code: "rule-world", label: "Object ↔ World rule", weight: 5 }],
          commitAllowed: false,
        });
      }
      if (out.length >= 5) break;
    }
    return out;
  }
}
