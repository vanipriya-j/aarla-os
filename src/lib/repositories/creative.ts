import type {
  CreativeEvent,
  CreativeNode,
  CreativeNodeAlias,
  CreativeNodeAsset,
  CreativeNodeNote,
  CreativeRelationship,
  CreativeNodeType,
  LifecycleStatus,
  MaturityStatus,
  RelationshipStatus,
  RelationshipType,
} from "@/lib/domain/creative-types";

export interface CreateNodeInput {
  title: string;
  description?: string;
  nodeTypes?: CreativeNodeType[];
  lifecycleStatus?: LifecycleStatus;
  maturityStatus?: MaturityStatus;
  isFuture?: boolean;
  notes?: string;
  source?: CreativeNode["source"];
  createdBy?: string;
  opportunityPayload?: Record<string, unknown> | null;
  aliases?: string[];
}

export interface CreateRelationshipInput {
  fromNodeId: string;
  toNodeId: string;
  relationshipType: RelationshipType;
  affinityScore: number;
  explanation: string;
  evidence?: string[];
  relationshipStatus?: RelationshipStatus;
  source?: CreativeRelationship["source"];
  confirmedBy?: string | null;
}

export interface CreativeNodeRepository {
  list(): Promise<CreativeNode[]>;
  getById(id: string): Promise<CreativeNode | null>;
  getBySlug(slug: string): Promise<CreativeNode | null>;
  create(input: CreateNodeInput): Promise<CreativeNode>;
  update(
    id: string,
    patch: Partial<
      Pick<
        CreativeNode,
        | "title"
        | "description"
        | "nodeTypes"
        | "lifecycleStatus"
        | "maturityStatus"
        | "isFuture"
        | "notes"
        | "opportunityPayload"
      >
    >,
  ): Promise<CreativeNode>;
}

export interface CreativeRelationshipRepository {
  list(): Promise<CreativeRelationship[]>;
  listForNode(nodeId: string): Promise<CreativeRelationship[]>;
  create(input: CreateRelationshipInput): Promise<CreativeRelationship>;
  updateStatus(
    id: string,
    status: RelationshipStatus,
    confirmedBy?: string | null,
  ): Promise<CreativeRelationship>;
  updateAffinity(
    id: string,
    affinityScore: number,
    explanation: string,
  ): Promise<CreativeRelationship>;
}

export interface CreativeAliasRepository {
  list(): Promise<CreativeNodeAlias[]>;
  add(nodeId: string, alias: string): Promise<CreativeNodeAlias>;
}

export interface CreativeNoteRepository {
  listForNode(nodeId: string): Promise<CreativeNodeNote[]>;
  add(nodeId: string, body: string, createdBy?: string): Promise<CreativeNodeNote>;
}

export interface CreativeAssetRepository {
  listForNode(nodeId: string): Promise<CreativeNodeAsset[]>;
  add(
    nodeId: string,
    input: { kind?: string; url: string; caption?: string },
  ): Promise<CreativeNodeAsset>;
}

export interface CreativeEventRepository {
  list(limit?: number): Promise<CreativeEvent[]>;
  listForEntity(entityType: string, entityId: string): Promise<CreativeEvent[]>;
  append(
    event: Omit<CreativeEvent, "id" | "organizationId" | "createdAt"> & {
      organizationId?: string;
    },
  ): Promise<CreativeEvent>;
}

export interface CreativeUnitOfWork {
  nodes: CreativeNodeRepository;
  relationships: CreativeRelationshipRepository;
  aliases: CreativeAliasRepository;
  notes: CreativeNoteRepository;
  assets: CreativeAssetRepository;
  events: CreativeEventRepository;
}
