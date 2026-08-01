import type { QueryResultRow } from "pg";
import { ORG_ID, stableId } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import { slugify, type CreativeNode, type CreativeRelationship } from "@/lib/domain/creative-types";
import type {
  CreateNodeInput,
  CreateRelationshipInput,
  CreativeUnitOfWork,
} from "@/lib/repositories/creative";
import { randomUUID } from "node:crypto";

type Q = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function mapNode(r: Record<string, unknown>): CreativeNode {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    title: String(r.title),
    slug: String(r.slug),
    description: String(r.description ?? ""),
    nodeTypes: (r.node_types as CreativeNode["nodeTypes"]) ?? ["idea"],
    lifecycleStatus: r.lifecycle_status as CreativeNode["lifecycleStatus"],
    maturityStatus: r.maturity_status as CreativeNode["maturityStatus"],
    isFuture: Boolean(r.is_future),
    confidence: Number(r.confidence ?? 1),
    source: r.source as CreativeNode["source"],
    createdBy: String(r.created_by ?? "founder"),
    notes: String(r.notes ?? ""),
    opportunityPayload: (r.opportunity_payload as Record<string, unknown>) ?? null,
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
  };
}

function mapRel(r: Record<string, unknown>): CreativeRelationship {
  const evidence = r.evidence;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    fromNodeId: String(r.from_node_id),
    toNodeId: String(r.to_node_id),
    relationshipType: r.relationship_type as CreativeRelationship["relationshipType"],
    affinityScore: Number(r.affinity_score ?? 0),
    relationshipStatus: r.relationship_status as CreativeRelationship["relationshipStatus"],
    explanation: String(r.explanation ?? ""),
    evidence: Array.isArray(evidence) ? (evidence as string[]) : [],
    source: r.source as CreativeRelationship["source"],
    confirmedBy: r.confirmed_by ? String(r.confirmed_by) : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
  };
}

async function uniqueSlug(q: Q, base: string): Promise<string> {
  const slug = slugify(base) || `idea-${randomUUID().slice(0, 8)}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const rows = await q<{ id: string }>(
      `select id from creative_nodes where organization_id = $1 and slug = $2`,
      [ORG_ID, candidate],
    );
    if (rows.length === 0) return candidate;
  }
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

export function createCreativeUnitOfWork(): CreativeUnitOfWork {
  const q: Q = poolQuery;

  return {
    nodes: {
      async list() {
        const rows = await q(`select * from creative_nodes where organization_id = $1 order by title`, [
          ORG_ID,
        ]);
        return rows.map(mapNode);
      },
      async getById(id) {
        const rows = await q(`select * from creative_nodes where organization_id = $1 and id = $2`, [
          ORG_ID,
          id,
        ]);
        return rows[0] ? mapNode(rows[0]) : null;
      },
      async getBySlug(slug) {
        const rows = await q(
          `select * from creative_nodes where organization_id = $1 and slug = $2`,
          [ORG_ID, slug],
        );
        return rows[0] ? mapNode(rows[0]) : null;
      },
      async create(input: CreateNodeInput) {
        const id = randomUUID();
        const slug = await uniqueSlug(q, input.title);
        const types = input.nodeTypes?.length ? input.nodeTypes : ["idea"];
        const rows = await q(
          `insert into creative_nodes (
            id, organization_id, title, slug, description, node_types,
            lifecycle_status, maturity_status, is_future, source, created_by, notes, opportunity_payload
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
          returning *`,
          [
            id,
            ORG_ID,
            input.title.trim(),
            slug,
            input.description ?? "",
            types,
            input.lifecycleStatus ?? "captured",
            input.maturityStatus ?? "seed",
            input.isFuture ?? true,
            input.source ?? "founder",
            input.createdBy ?? "founder",
            input.notes ?? "",
            JSON.stringify(input.opportunityPayload ?? null),
          ],
        );
        for (const alias of input.aliases ?? []) {
          await q(
            `insert into creative_node_aliases (id, organization_id, node_id, alias)
             values ($1,$2,$3,$4) on conflict do nothing`,
            [randomUUID(), ORG_ID, id, alias.trim()],
          );
        }
        return mapNode(rows[0]);
      },
      async update(id, patch) {
        const current = await q(`select * from creative_nodes where organization_id = $1 and id = $2`, [
          ORG_ID,
          id,
        ]);
        if (!current[0]) throw new Error(`Node not found: ${id}`);
        const rows = await q(
          `update creative_nodes set
            title = coalesce($3, title),
            description = coalesce($4, description),
            node_types = coalesce($5, node_types),
            lifecycle_status = coalesce($6, lifecycle_status),
            maturity_status = coalesce($7, maturity_status),
            is_future = coalesce($8, is_future),
            notes = coalesce($9, notes),
            opportunity_payload = coalesce($10::jsonb, opportunity_payload)
           where organization_id = $1 and id = $2
           returning *`,
          [
            ORG_ID,
            id,
            patch.title ?? null,
            patch.description ?? null,
            patch.nodeTypes ?? null,
            patch.lifecycleStatus ?? null,
            patch.maturityStatus ?? null,
            patch.isFuture ?? null,
            patch.notes ?? null,
            patch.opportunityPayload !== undefined
              ? JSON.stringify(patch.opportunityPayload)
              : null,
          ],
        );
        return mapNode(rows[0]);
      },
    },

    relationships: {
      async list() {
        const rows = await q(
          `select * from creative_relationships where organization_id = $1 order by affinity_score desc`,
          [ORG_ID],
        );
        return rows.map(mapRel);
      },
      async listForNode(nodeId) {
        const rows = await q(
          `select * from creative_relationships
           where organization_id = $1 and (from_node_id = $2 or to_node_id = $2)
           order by affinity_score desc`,
          [ORG_ID, nodeId],
        );
        return rows.map(mapRel);
      },
      async create(input: CreateRelationshipInput) {
        if (!input.explanation?.trim()) {
          throw new Error("Affinity relationships require an explanation.");
        }
        const id = randomUUID();
        const rows = await q(
          `insert into creative_relationships (
            id, organization_id, from_node_id, to_node_id, relationship_type,
            affinity_score, relationship_status, explanation, evidence, source, confirmed_by
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
          on conflict (organization_id, from_node_id, to_node_id, relationship_type)
          do update set
            affinity_score = excluded.affinity_score,
            explanation = excluded.explanation,
            relationship_status = excluded.relationship_status,
            source = excluded.source,
            confirmed_by = excluded.confirmed_by,
            updated_at = now()
          returning *`,
          [
            id,
            ORG_ID,
            input.fromNodeId,
            input.toNodeId,
            input.relationshipType,
            input.affinityScore,
            input.relationshipStatus ?? "suggested",
            input.explanation.trim(),
            JSON.stringify(input.evidence ?? []),
            input.source ?? "rule-based",
            input.confirmedBy ?? null,
          ],
        );
        return mapRel(rows[0]);
      },
      async updateStatus(id, status, confirmedBy) {
        const rows = await q(
          `update creative_relationships set
            relationship_status = $3,
            confirmed_by = coalesce($4, confirmed_by),
            source = case when $3 = 'established' then 'founder-confirmed' else source end
           where organization_id = $1 and id = $2
           returning *`,
          [ORG_ID, id, status, confirmedBy ?? null],
        );
        if (!rows[0]) throw new Error(`Relationship not found: ${id}`);
        return mapRel(rows[0]);
      },
      async updateAffinity(id, affinityScore, explanation) {
        if (!explanation.trim()) throw new Error("Explanation required when adjusting affinity.");
        const rows = await q(
          `update creative_relationships set affinity_score = $3, explanation = $4
           where organization_id = $1 and id = $2 returning *`,
          [ORG_ID, id, affinityScore, explanation.trim()],
        );
        if (!rows[0]) throw new Error(`Relationship not found: ${id}`);
        return mapRel(rows[0]);
      },
    },

    aliases: {
      async list() {
        const rows = await q(
          `select id, organization_id, node_id, alias from creative_node_aliases where organization_id = $1`,
          [ORG_ID],
        );
        return rows.map((r) => ({
          id: String(r.id),
          organizationId: String(r.organization_id),
          nodeId: String(r.node_id),
          alias: String(r.alias),
        }));
      },
      async add(nodeId, alias) {
        const id = randomUUID();
        const rows = await q(
          `insert into creative_node_aliases (id, organization_id, node_id, alias)
           values ($1,$2,$3,$4) returning *`,
          [id, ORG_ID, nodeId, alias.trim()],
        );
        return {
          id: String(rows[0].id),
          organizationId: ORG_ID,
          nodeId,
          alias: String(rows[0].alias),
        };
      },
    },

    notes: {
      async listForNode(nodeId) {
        const rows = await q(
          `select * from creative_node_notes where organization_id = $1 and node_id = $2 order by created_at desc`,
          [ORG_ID, nodeId],
        );
        return rows.map((r) => ({
          id: String(r.id),
          organizationId: ORG_ID,
          nodeId,
          body: String(r.body),
          createdBy: String(r.created_by),
          createdAt: new Date(String(r.created_at)).toISOString(),
        }));
      },
      async add(nodeId, body, createdBy = "founder") {
        const id = randomUUID();
        const rows = await q(
          `insert into creative_node_notes (id, organization_id, node_id, body, created_by)
           values ($1,$2,$3,$4,$5) returning *`,
          [id, ORG_ID, nodeId, body.trim(), createdBy],
        );
        return {
          id,
          organizationId: ORG_ID,
          nodeId,
          body: String(rows[0].body),
          createdBy,
          createdAt: new Date(String(rows[0].created_at)).toISOString(),
        };
      },
    },

    assets: {
      async listForNode(nodeId) {
        const rows = await q(
          `select * from creative_node_assets where organization_id = $1 and node_id = $2 order by created_at desc`,
          [ORG_ID, nodeId],
        );
        return rows.map((r) => ({
          id: String(r.id),
          organizationId: ORG_ID,
          nodeId,
          kind: String(r.kind),
          url: String(r.url),
          caption: String(r.caption),
          createdAt: new Date(String(r.created_at)).toISOString(),
        }));
      },
      async add(nodeId, input) {
        const id = randomUUID();
        const rows = await q(
          `insert into creative_node_assets (id, organization_id, node_id, kind, url, caption)
           values ($1,$2,$3,$4,$5,$6) returning *`,
          [id, ORG_ID, nodeId, input.kind ?? "image", input.url, input.caption ?? ""],
        );
        return {
          id,
          organizationId: ORG_ID,
          nodeId,
          kind: String(rows[0].kind),
          url: String(rows[0].url),
          caption: String(rows[0].caption),
          createdAt: new Date(String(rows[0].created_at)).toISOString(),
        };
      },
    },

    events: {
      async list(limit = 100) {
        const rows = await q(
          `select * from creative_events where organization_id = $1 order by created_at desc limit $2`,
          [ORG_ID, limit],
        );
        return rows.map((r) => ({
          id: String(r.id),
          organizationId: ORG_ID,
          eventType: String(r.event_type),
          entityType: String(r.entity_type),
          entityId: r.entity_id ? String(r.entity_id) : null,
          actor: String(r.actor),
          source: String(r.source),
          previousValue: r.previous_value,
          newValue: r.new_value,
          reasoning: r.reasoning ? String(r.reasoning) : null,
          createdAt: new Date(String(r.created_at)).toISOString(),
        }));
      },
      async listForEntity(entityType, entityId) {
        const rows = await q(
          `select * from creative_events
           where organization_id = $1 and entity_type = $2 and entity_id = $3
           order by created_at desc`,
          [ORG_ID, entityType, entityId],
        );
        return rows.map((r) => ({
          id: String(r.id),
          organizationId: ORG_ID,
          eventType: String(r.event_type),
          entityType: String(r.entity_type),
          entityId: r.entity_id ? String(r.entity_id) : null,
          actor: String(r.actor),
          source: String(r.source),
          previousValue: r.previous_value,
          newValue: r.new_value,
          reasoning: r.reasoning ? String(r.reasoning) : null,
          createdAt: new Date(String(r.created_at)).toISOString(),
        }));
      },
      async append(event) {
        const id = randomUUID();
        const rows = await q(
          `insert into creative_events (
            id, organization_id, event_type, entity_type, entity_id, actor, source,
            previous_value, new_value, reasoning
          ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10) returning *`,
          [
            id,
            ORG_ID,
            event.eventType,
            event.entityType,
            event.entityId ?? null,
            event.actor ?? "founder",
            event.source ?? "founder",
            JSON.stringify(event.previousValue ?? null),
            JSON.stringify(event.newValue ?? null),
            event.reasoning ?? null,
          ],
        );
        return {
          id,
          organizationId: ORG_ID,
          eventType: String(rows[0].event_type),
          entityType: String(rows[0].entity_type),
          entityId: rows[0].entity_id ? String(rows[0].entity_id) : null,
          actor: String(rows[0].actor),
          source: String(rows[0].source),
          previousValue: rows[0].previous_value,
          newValue: rows[0].new_value,
          reasoning: rows[0].reasoning ? String(rows[0].reasoning) : null,
          createdAt: new Date(String(rows[0].created_at)).toISOString(),
        };
      },
    },
  };
}

/** Stable seed helper — deterministic UUIDs for universe nodes. */
export function universeNodeId(slug: string): string {
  return stableId(`universe-node:${slug}`);
}

export function universeRelId(from: string, to: string, type: string): string {
  return stableId(`universe-rel:${from}:${to}:${type}`);
}
