-- Aarla Universe — creative knowledge graph (nodes + relationships)
-- Affinity is stored on relationships; inventory/commerce remains separate.

-- ---------------------------------------------------------------------------
-- Creative nodes
-- ---------------------------------------------------------------------------
create table creative_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  slug text not null,
  description text not null default '',
  node_types text[] not null default array['idea']::text[],
  lifecycle_status text not null default 'captured'
    check (lifecycle_status in (
      'captured','exploring','researching','developing','ready','active','paused','archived'
    )),
  maturity_status text not null default 'seed'
    check (maturity_status in ('seed','emerging','developed','established')),
  is_future boolean not null default true,
  confidence numeric(4,3) not null default 1.0,
  source text not null default 'founder'
    check (source in ('founder','seed','imported','ai-suggested','rule-based')),
  created_by text not null default 'founder',
  notes text not null default '',
  -- optional product / content opportunity fields (null for ordinary nodes)
  opportunity_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index creative_nodes_org_idx on creative_nodes(organization_id);
create index creative_nodes_title_idx on creative_nodes(organization_id, title);
create index creative_nodes_lifecycle_idx on creative_nodes(organization_id, lifecycle_status);
create index creative_nodes_future_idx on creative_nodes(organization_id, is_future);
create index creative_nodes_types_gin on creative_nodes using gin (node_types);
create trigger creative_nodes_updated_at before update on creative_nodes
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------
create table creative_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  from_node_id uuid not null references creative_nodes(id) on delete cascade,
  to_node_id uuid not null references creative_nodes(id) on delete cascade,
  relationship_type text not null,
  affinity_score numeric(5,2) not null default 0
    check (affinity_score >= 0 and affinity_score <= 100),
  relationship_status text not null default 'suggested'
    check (relationship_status in ('established','inferred','suggested','rejected')),
  explanation text not null,
  evidence jsonb not null default '[]'::jsonb,
  source text not null default 'rule-based'
    check (source in (
      'founder-confirmed','existing-data','rule-based','AI-suggested','imported','seed'
    )),
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_node_id <> to_node_id),
  unique (organization_id, from_node_id, to_node_id, relationship_type)
);

create index creative_rel_org_idx on creative_relationships(organization_id);
create index creative_rel_from_idx on creative_relationships(from_node_id);
create index creative_rel_to_idx on creative_relationships(to_node_id);
create index creative_rel_type_idx on creative_relationships(organization_id, relationship_type);
create index creative_rel_score_idx on creative_relationships(organization_id, affinity_score desc);
create index creative_rel_status_idx on creative_relationships(organization_id, relationship_status);
create trigger creative_relationships_updated_at before update on creative_relationships
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Aliases, assets, notes, events
-- ---------------------------------------------------------------------------
create table creative_node_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  node_id uuid not null references creative_nodes(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, alias)
);
create index creative_aliases_node_idx on creative_node_aliases(node_id);
create index creative_aliases_alias_idx on creative_node_aliases(organization_id, lower(alias));

create table creative_node_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  node_id uuid not null references creative_nodes(id) on delete cascade,
  kind text not null default 'image',
  url text not null default '',
  caption text not null default '',
  created_at timestamptz not null default now()
);
create index creative_assets_node_idx on creative_node_assets(node_id);

create table creative_node_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  node_id uuid not null references creative_nodes(id) on delete cascade,
  body text not null,
  created_by text not null default 'founder',
  created_at timestamptz not null default now()
);
create index creative_notes_node_idx on creative_node_notes(node_id);

create table creative_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  actor text not null default 'founder',
  source text not null default 'founder',
  previous_value jsonb,
  new_value jsonb,
  reasoning text,
  created_at timestamptz not null default now()
);
create index creative_events_org_idx on creative_events(organization_id, created_at desc);
create index creative_events_entity_idx on creative_events(entity_type, entity_id);
