-- Veritas Systems Truth Engine Starter Schema
-- PostgreSQL / Supabase-compatible foundation for WEAPR v1

create extension if not exists pgcrypto;

create table if not exists sources (
    id uuid primary key default gen_random_uuid(),
    external_id text,
    title text not null,
    source_type text not null,
    origin text,
    author text,
    publisher text,
    url text,
    jurisdiction text,
    language text default 'en',
    published_at timestamptz,
    acquired_at timestamptz not null default now(),
    reliability_prior numeric(5,4) not null default 0.5000 check (reliability_prior >= 0 and reliability_prior <= 1),
    chain_of_custody_score numeric(5,4) not null default 0.5000 check (chain_of_custody_score >= 0 and chain_of_custody_score <= 1),
    current_version_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists source_versions (
    id uuid primary key default gen_random_uuid(),
    source_id uuid not null references sources(id) on delete cascade,
    version_number integer not null,
    content_hash text not null,
    mime_type text,
    extraction_method text,
    extraction_confidence numeric(5,4) check (extraction_confidence >= 0 and extraction_confidence <= 1),
    raw_text text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (source_id, version_number),
    unique (content_hash)
);

alter table sources
    drop constraint if exists fk_sources_current_version;

alter table sources
    add constraint fk_sources_current_version
    foreign key (current_version_id) references source_versions(id) on delete set null;

create table if not exists documents (
    id uuid primary key default gen_random_uuid(),
    source_version_id uuid not null references source_versions(id) on delete cascade,
    storage_uri text,
    file_name text,
    page_count integer,
    checksum text,
    created_at timestamptz not null default now()
);

create table if not exists entities (
    id uuid primary key default gen_random_uuid(),
    entity_type text not null,
    canonical_name text not null,
    description text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_entities_type_name
on entities(entity_type, canonical_name);

create table if not exists entity_aliases (
    id uuid primary key default gen_random_uuid(),
    entity_id uuid not null references entities(id) on delete cascade,
    alias text not null,
    alias_type text,
    created_at timestamptz not null default now()
);

create index if not exists idx_entity_aliases_alias on entity_aliases(alias);

create table if not exists claims (
    id uuid primary key default gen_random_uuid(),
    claim_text text not null,
    subject_entity_id uuid references entities(id),
    predicate text not null,
    object_entity_id uuid references entities(id),
    object_literal text,
    polarity text not null default 'affirmed',
    modality text not null default 'asserted_fact',
    time_start timestamptz,
    time_end timestamptz,
    location_entity_id uuid references entities(id),
    canonical_fingerprint text not null,
    extraction_source_version_id uuid references source_versions(id),
    extracted_by text,
    extraction_confidence numeric(5,4) check (extraction_confidence >= 0 and extraction_confidence <= 1),
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_claims_fingerprint on claims(canonical_fingerprint);
create index if not exists idx_claims_predicate on claims(predicate);
create index if not exists idx_claims_subject_predicate on claims(subject_entity_id, predicate);
create index if not exists idx_claims_time_window on claims(time_start, time_end);

create table if not exists evidence_spans (
    id uuid primary key default gen_random_uuid(),
    claim_id uuid not null references claims(id) on delete cascade,
    source_version_id uuid not null references source_versions(id) on delete cascade,
    document_id uuid references documents(id) on delete set null,
    page_number integer,
    section_label text,
    char_start integer,
    char_end integer,
    line_start integer,
    line_end integer,
    quoted_text text not null,
    span_hash text not null,
    evidence_role text not null default 'supporting',
    extraction_confidence numeric(5,4) check (extraction_confidence >= 0 and extraction_confidence <= 1),
    created_at timestamptz not null default now(),
    unique (source_version_id, span_hash)
);

create index if not exists idx_evidence_spans_claim_id on evidence_spans(claim_id);
create index if not exists idx_evidence_spans_source_version_id on evidence_spans(source_version_id);

create table if not exists claim_relations (
    id uuid primary key default gen_random_uuid(),
    from_claim_id uuid not null references claims(id) on delete cascade,
    to_claim_id uuid not null references claims(id) on delete cascade,
    relation_type text not null,
    confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
    detected_by text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (from_claim_id, to_claim_id, relation_type)
);

create table if not exists source_lineage (
    id uuid primary key default gen_random_uuid(),
    child_source_id uuid not null references sources(id) on delete cascade,
    parent_source_id uuid references sources(id) on delete cascade,
    lineage_type text not null,
    confidence numeric(5,4) not null default 0.5000 check (confidence >= 0 and confidence <= 1),
    created_at timestamptz not null default now(),
    unique (child_source_id, parent_source_id, lineage_type)
);

create table if not exists truth_assessments (
    id uuid primary key default gen_random_uuid(),
    claim_id uuid not null references claims(id) on delete cascade,
    model_version text not null,
    truth_score numeric(5,4) not null check (truth_score >= 0 and truth_score <= 1),
    truth_state text not null,
    support_score numeric(5,4) not null check (support_score >= 0 and support_score <= 1),
    risk_penalty numeric(5,4) not null check (risk_penalty >= 0 and risk_penalty <= 1),
    source_reliability numeric(5,4) not null check (source_reliability >= 0 and source_reliability <= 1),
    evidence_specificity numeric(5,4) not null check (evidence_specificity >= 0 and evidence_specificity <= 1),
    corroboration_strength numeric(5,4) not null check (corroboration_strength >= 0 and corroboration_strength <= 1),
    temporal_consistency numeric(5,4) not null check (temporal_consistency >= 0 and temporal_consistency <= 1),
    contradiction_pressure numeric(5,4) not null check (contradiction_pressure >= 0 and contradiction_pressure <= 1),
    manipulation_signal numeric(5,4) not null check (manipulation_signal >= 0 and manipulation_signal <= 1),
    explanation jsonb not null default '{}'::jsonb,
    reviewed_by_human boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists idx_truth_assessments_claim_model
on truth_assessments(claim_id, model_version, created_at desc);

create table if not exists review_queue (
    id uuid primary key default gen_random_uuid(),
    claim_id uuid not null references claims(id) on delete cascade,
    assessment_id uuid references truth_assessments(id) on delete set null,
    reason text not null,
    priority text not null default 'normal',
    status text not null default 'open',
    assigned_to text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_review_queue_status_priority on review_queue(status, priority);

create table if not exists provenance_edges (
    id uuid primary key default gen_random_uuid(),
    from_node_type text not null,
    from_node_id uuid not null,
    to_node_type text not null,
    to_node_id uuid not null,
    edge_type text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_provenance_from on provenance_edges(from_node_type, from_node_id);
create index if not exists idx_provenance_to on provenance_edges(to_node_type, to_node_id);
create index if not exists idx_sources_type_origin on sources(source_type, origin);
create index if not exists idx_source_versions_source_id on source_versions(source_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sources_updated_at on sources;
create trigger trg_sources_updated_at
before update on sources
for each row execute function set_updated_at();

drop trigger if exists trg_entities_updated_at on entities;
create trigger trg_entities_updated_at
before update on entities
for each row execute function set_updated_at();

drop trigger if exists trg_claims_updated_at on claims;
create trigger trg_claims_updated_at
before update on claims
for each row execute function set_updated_at();

drop trigger if exists trg_review_queue_updated_at on review_queue;
create trigger trg_review_queue_updated_at
before update on review_queue
for each row execute function set_updated_at();

create or replace function ensure_claim_has_evidence_before_assessment()
returns trigger as $$
begin
    if not exists (
        select 1 from evidence_spans es where es.claim_id = new.claim_id
    ) then
        raise exception 'Cannot assess claim % without at least one evidence span', new.claim_id;
    end if;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ensure_claim_has_evidence_before_assessment on truth_assessments;
create trigger trg_ensure_claim_has_evidence_before_assessment
before insert on truth_assessments
for each row
execute function ensure_claim_has_evidence_before_assessment();

create or replace function prevent_evidence_span_updates()
returns trigger as $$
begin
    raise exception 'evidence_spans are immutable; create a new span/version instead';
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_evidence_span_updates on evidence_spans;
create trigger trg_prevent_evidence_span_updates
before update on evidence_spans
for each row
execute function prevent_evidence_span_updates();
