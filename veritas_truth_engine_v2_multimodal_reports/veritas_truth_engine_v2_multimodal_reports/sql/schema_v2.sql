create extension if not exists pgcrypto;

create table if not exists sources (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    source_type text not null,
    origin text,
    author text,
    publisher text,
    url text,
    published_at timestamptz,
    acquired_at timestamptz not null default now(),
    reliability_prior numeric(5,4) not null check (reliability_prior >= 0 and reliability_prior <= 1),
    chain_of_custody_score numeric(5,4) not null check (chain_of_custody_score >= 0 and chain_of_custody_score <= 1),
    primary_source boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists source_versions (
    id uuid primary key default gen_random_uuid(),
    source_id uuid not null references sources(id) on delete cascade,
    version_number integer not null,
    extraction_method text,
    extraction_confidence numeric(5,4) check (extraction_confidence >= 0 and extraction_confidence <= 1),
    content_hash text not null,
    supersedes_version_id uuid references source_versions(id) on delete set null,
    revision_reason text,
    raw_text text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (source_id, version_number),
    unique (content_hash)
);

create table if not exists claims (
    id uuid primary key default gen_random_uuid(),
    claim_text text not null,
    subject_text text,
    predicate text not null,
    object_text text,
    polarity text not null check (polarity in ('affirmed','denied','uncertain')),
    modality text not null check (modality in ('asserted_fact','allegation','opinion','forecast','quote')),
    canonical_fingerprint text not null,
    time_start timestamptz,
    time_end timestamptz,
    location_text text,
    public_impact boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_claims_fingerprint on claims(canonical_fingerprint);

create table if not exists evidence_spans (
    id uuid primary key default gen_random_uuid(),
    claim_id uuid not null references claims(id) on delete cascade,
    source_version_id uuid not null references source_versions(id) on delete cascade,
    quoted_text text not null,
    evidence_role text not null check (evidence_role in ('supporting','contradicting','contextual')),
    page_number integer,
    line_start integer,
    line_end integer,
    char_start integer,
    char_end integer,
    section_label text,
    extraction_confidence numeric(5,4) check (extraction_confidence >= 0 and extraction_confidence <= 1),
    created_at timestamptz not null default now()
);

create table if not exists source_lineage (
    id uuid primary key default gen_random_uuid(),
    child_source_id uuid not null references sources(id) on delete cascade,
    parent_source_id uuid references sources(id) on delete cascade,
    lineage_type text not null check (lineage_type in ('repost','wire_copy','quote_chain','mirror','summary_of','derived_from')),
    confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
    created_at timestamptz not null default now(),
    unique (child_source_id, parent_source_id, lineage_type)
);

create table if not exists claim_relations (
    id uuid primary key default gen_random_uuid(),
    from_claim_id uuid not null references claims(id) on delete cascade,
    to_claim_id uuid not null references claims(id) on delete cascade,
    relation_type text not null check (relation_type in ('supports','partially_supports','contradicts','temporally_conflicts','scope_conflicts','reframes','duplicate','unrelated')),
    confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
    created_at timestamptz not null default now(),
    unique (from_claim_id, to_claim_id, relation_type)
);

create table if not exists causal_links (
    id uuid primary key default gen_random_uuid(),
    cause_claim_id uuid not null references claims(id) on delete cascade,
    effect_claim_id uuid not null references claims(id) on delete cascade,
    confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
    relation_label text,
    created_at timestamptz not null default now(),
    unique (cause_claim_id, effect_claim_id, relation_label)
);

create table if not exists truth_assessments_v2 (
    id uuid primary key default gen_random_uuid(),
    claim_id uuid not null references claims(id) on delete cascade,
    model_version text not null,
    posterior_truth_score numeric(5,4) not null check (posterior_truth_score >= 0 and posterior_truth_score <= 1),
    confidence_band numeric(5,4) not null check (confidence_band >= 0 and confidence_band <= 1),
    truth_state text not null check (truth_state in ('strongly_supported','supported','mixed_or_unresolved','contested','likely_false','insufficient_evidence')),
    release_state text not null check (release_state in ('auto_release','review_required','hold')),
    evidence_support numeric(5,4) not null check (evidence_support >= 0 and evidence_support <= 1),
    source_reliability numeric(5,4) not null check (source_reliability >= 0 and source_reliability <= 1),
    provenance_integrity numeric(5,4) not null check (provenance_integrity >= 0 and provenance_integrity <= 1),
    independence_adjusted_corroboration numeric(5,4) not null check (independence_adjusted_corroboration >= 0 and independence_adjusted_corroboration <= 1),
    temporal_coherence numeric(5,4) not null check (temporal_coherence >= 0 and temporal_coherence <= 1),
    causal_coherence numeric(5,4) not null check (causal_coherence >= 0 and causal_coherence <= 1),
    contradiction_pressure numeric(5,4) not null check (contradiction_pressure >= 0 and contradiction_pressure <= 1),
    revision_stability numeric(5,4) not null check (revision_stability >= 0 and revision_stability <= 1),
    deception_signal numeric(5,4) not null check (deception_signal >= 0 and deception_signal <= 1),
    explanation jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists review_queue (
    id uuid primary key default gen_random_uuid(),
    claim_id uuid not null references claims(id) on delete cascade,
    assessment_id uuid references truth_assessments_v2(id) on delete set null,
    reason text not null,
    priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
    status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
    assigned_to text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function ensure_claim_has_evidence_before_assessment_v2()
returns trigger as $$
begin
    if not exists (select 1 from evidence_spans where claim_id = new.claim_id) then
        raise exception 'Cannot assess claim % without evidence.', new.claim_id;
    end if;
    return new;
end;
$$ language plpgsql;

create or replace trigger trg_ensure_claim_has_evidence_before_assessment_v2
before insert on truth_assessments_v2
for each row
execute function ensure_claim_has_evidence_before_assessment_v2();

create or replace function prevent_evidence_updates_v2()
returns trigger as $$
begin
    raise exception 'evidence_spans are immutable in Truth Engine v2';
end;
$$ language plpgsql;

create or replace trigger trg_prevent_evidence_updates_v2
before update on evidence_spans
for each row
execute function prevent_evidence_updates_v2();
