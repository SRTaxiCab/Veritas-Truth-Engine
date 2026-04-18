create table if not exists provenance_nodes_v2 (
    id text primary key,
    dossier_id text not null,
    node_type text not null,
    label text not null,
    detail text,
    weight numeric(8,4),
    created_at timestamptz not null default now()
);

create table if not exists provenance_edges_v2 (
    id text primary key,
    dossier_id text not null,
    from_node_id text not null,
    to_node_id text not null,
    relation text not null,
    strength numeric(8,4),
    created_at timestamptz not null default now()
);

create table if not exists evidence_dossiers_v2 (
    dossier_id text primary key,
    title text not null,
    product text not null,
    classification text,
    subject text,
    release_recommendation text not null,
    pdf_path text,
    html_path text,
    created_at timestamptz not null default now()
);

create index if not exists idx_provenance_nodes_v2_dossier_id
on provenance_nodes_v2(dossier_id);

create index if not exists idx_provenance_edges_v2_dossier_id
on provenance_edges_v2(dossier_id);
