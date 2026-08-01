import type {
  AffinityCategory,
  AffinityFactor,
  AffinityResult,
  CreativeNode,
  CreativeRelationship,
} from "./creative-types";
import { categorizeNode } from "./creative-types";

const CATEGORY_ORDER: AffinityCategory[] = [
  "Worlds",
  "Concepts",
  "Collections",
  "Objects",
  "Stories / Content",
  "Research",
  "People / Places",
  "Other",
];

/** Pure affinity assembly — scores come from persisted relationships + light boosts. */
export function buildAffinityResults(
  center: CreativeNode,
  nodes: CreativeNode[],
  relationships: CreativeRelationship[],
): AffinityResult[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const results: AffinityResult[] = [];

  for (const rel of relationships) {
    if (rel.relationshipStatus === "rejected") continue;
    const otherId =
      rel.fromNodeId === center.id
        ? rel.toNodeId
        : rel.toNodeId === center.id
          ? rel.fromNodeId
          : null;
    if (!otherId) continue;
    const node = byId.get(otherId);
    if (!node) continue;

    const factors = factorsFor(center, node, rel);
    const boost = factors.reduce((s, f) => s + f.weight, 0);
    const score = Math.min(100, Math.round(Number(rel.affinityScore) + boost));

    results.push({
      node,
      relationship: rel,
      score,
      explanation: rel.explanation,
      factors,
      category: categorizeNode(node),
    });
  }

  results.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title));
  return results;
}

export function groupByCategory(
  affinities: AffinityResult[],
): Record<AffinityCategory, AffinityResult[]> {
  const out = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, [] as AffinityResult[]])) as Record<
    AffinityCategory,
    AffinityResult[]
  >;
  for (const a of affinities) out[a.category].push(a);
  return out;
}

function factorsFor(
  center: CreativeNode,
  other: CreativeNode,
  rel: CreativeRelationship,
): AffinityFactor[] {
  const factors: AffinityFactor[] = [
    {
      code: "relationship",
      label: `${rel.relationshipStatus} ${rel.relationshipType}`,
      weight: 0,
    },
  ];
  const shared = center.nodeTypes.filter((t) => other.nodeTypes.includes(t));
  if (shared.length) {
    factors.push({
      code: "shared-types",
      label: `Shared types: ${shared.join(", ")}`,
      weight: Math.min(4, shared.length),
    });
  }
  if (other.isFuture && center.isFuture) {
    factors.push({
      code: "future",
      label: "Both marked future — exploration space",
      weight: 1,
    });
  }
  if (rel.source === "founder-confirmed" || rel.relationshipStatus === "established") {
    factors.push({
      code: "confirmed",
      label: "Founder-confirmed or established edge",
      weight: 2,
    });
  }
  return factors;
}

export function matchNodeByTitleOrAlias(
  query: string,
  nodes: CreativeNode[],
  aliases: { nodeId: string; alias: string }[],
): CreativeNode | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = nodes.find((n) => n.title.toLowerCase() === q || n.slug === q);
  if (exact) return exact;
  const aliasHit = aliases.find((a) => a.alias.toLowerCase() === q);
  if (aliasHit) return nodes.find((n) => n.id === aliasHit.nodeId) ?? null;
  const partial = nodes.find(
    (n) => n.title.toLowerCase().includes(q) || q.includes(n.title.toLowerCase()),
  );
  return partial ?? null;
}
