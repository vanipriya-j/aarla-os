"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as universe from "@/lib/application/universe-service";
import type { CreativeNodeType, LifecycleStatus, MaturityStatus } from "@/lib/domain/creative-types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

export async function exploreUniverseAction(query: string) {
  return wrap(() => universe.exploreUniverse(query));
}

export async function getUniverseNodeAction(nodeId: string) {
  return wrap(() => universe.getUniverseNode(nodeId));
}

export async function listFutureUniverseNodesAction(
  filter?: CreativeNodeType | "unclassified",
) {
  return wrap(() => universe.listFutureUniverseNodes(filter));
}

export async function createUniverseNodeAction(input: {
  title: string;
  description?: string;
  nodeTypes?: CreativeNodeType[];
  lifecycleStatus?: LifecycleStatus;
  maturityStatus?: MaturityStatus;
  isFuture?: boolean;
  notes?: string;
  saveUnclassified?: boolean;
  relatedNodeId?: string;
  relationshipType?: Parameters<typeof universe.createUniverseNode>[0]["relationshipType"];
  affinityScore?: number;
  explanation?: string;
}) {
  return wrap(() => universe.createUniverseNode(input));
}

export async function confirmUniverseRelationshipAction(id: string) {
  return wrap(() => universe.confirmUniverseRelationship(id));
}

export async function rejectUniverseRelationshipAction(id: string) {
  return wrap(() => universe.rejectUniverseRelationship(id));
}

export async function adjustUniverseAffinityAction(
  id: string,
  affinityScore: number,
  explanation: string,
) {
  return wrap(() => universe.adjustUniverseAffinity(id, affinityScore, explanation));
}

export async function createUniverseContentConceptAction(
  input: Parameters<typeof universe.createUniverseContentConcept>[0],
) {
  return wrap(() => universe.createUniverseContentConcept(input));
}

export async function createUniverseProductOpportunityAction(
  input: Parameters<typeof universe.createUniverseProductOpportunity>[0],
) {
  return wrap(() => universe.createUniverseProductOpportunity(input));
}

export async function promoteUniverseNodeAction(
  nodeId: string,
  addTypes: CreativeNodeType[],
  markFuture?: boolean,
) {
  return wrap(() => universe.promoteUniverseNode(nodeId, addTypes, markFuture));
}

export async function markUniverseNodeFutureAction(nodeId: string, isFuture: boolean) {
  return wrap(() => universe.markUniverseNodeFuture(nodeId, isFuture));
}

export async function addUniverseNoteAction(nodeId: string, body: string) {
  return wrap(() => universe.addUniverseNote(nodeId, body));
}
