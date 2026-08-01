import { CreativeEngine } from "@/lib/engine/creative-engine";
import { createCreativeUnitOfWork } from "@/lib/infra/repositories/postgres-creative";
import type { CreativeNodeType, LifecycleStatus, MaturityStatus } from "@/lib/domain/creative-types";

function engine() {
  return new CreativeEngine(createCreativeUnitOfWork());
}

export async function exploreUniverse(query: string) {
  return engine().explore(query);
}

export async function getUniverseNode(nodeId: string) {
  return engine().getNodeDetail(nodeId);
}

export async function listFutureUniverseNodes(filter?: CreativeNodeType | "unclassified") {
  return engine().listFuture(filter);
}

export async function createUniverseNode(input: {
  title: string;
  description?: string;
  nodeTypes?: CreativeNodeType[];
  lifecycleStatus?: LifecycleStatus;
  maturityStatus?: MaturityStatus;
  isFuture?: boolean;
  notes?: string;
  saveUnclassified?: boolean;
  relatedNodeId?: string;
  relationshipType?: Parameters<CreativeEngine["createNode"]>[0]["relationshipType"];
  affinityScore?: number;
  explanation?: string;
}) {
  return engine().createNode(input);
}

export async function confirmUniverseRelationship(id: string) {
  return engine().confirmRelationship(id);
}

export async function rejectUniverseRelationship(id: string) {
  return engine().rejectRelationship(id);
}

export async function adjustUniverseAffinity(
  id: string,
  affinityScore: number,
  explanation: string,
) {
  return engine().adjustAffinity(id, affinityScore, explanation);
}

export async function createUniverseContentConcept(
  input: Parameters<CreativeEngine["createContentConcept"]>[0],
) {
  return engine().createContentConcept(input);
}

export async function createUniverseProductOpportunity(
  input: Parameters<CreativeEngine["createProductOpportunity"]>[0],
) {
  return engine().createProductOpportunity(input);
}

export async function promoteUniverseNode(
  nodeId: string,
  addTypes: CreativeNodeType[],
  markFuture?: boolean,
) {
  return engine().promoteTypes(nodeId, addTypes, markFuture);
}

export async function markUniverseNodeFuture(nodeId: string, isFuture: boolean) {
  return engine().markFuture(nodeId, isFuture);
}

export async function addUniverseNote(nodeId: string, body: string) {
  return engine().addNote(nodeId, body);
}
