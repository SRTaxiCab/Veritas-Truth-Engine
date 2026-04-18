create table if not exists canonical_entities_v2 (
    id uuid primary key default gen_random_uuid(),
    canonical_name text not null,
    normalized_name text not null,
    entity_type text not null default 'unknown',
    confidence numeric(5,4) not null default 0.8000 check (confidence >= 0 and confidence <= 1),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (normalized_name, entity_type)
);

create table if not exists entity_aliases_v2 (
    id uuid primary key default gen_random_uuid(),
    entity_id uuid not null references canonical_entities_v2(id) on delete cascade,
    alias text not null,
    normalized_alias text not null,
    provenance_claim_id text,
    created_at timestamptz not null default now(),
    unique (entity_id, normalized_alias)
);

create table if not exists contradiction_graph_edges_v2 (
    id uuid primary key default gen_random_uuid(),
    from_node_id text not null,
    to_node_id text not null,
    edge_type text not null,
    weight numeric(5,4) not null default 0.5000 check (weight >= 0 and weight <= 1),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_entity_aliases_v2_alias on entity_aliases_v2(normalized_alias);
create index if not exists idx_contradiction_graph_edges_v2_pair on contradiction_graph_edges_v2(from_node_id, to_node_id, edge_type);
