-- Veritas Truth Engine Enterprise Schema
-- Production target for tenant isolation, identity inventory, audit logs,
-- durable jobs, document ingestion, evidence binding, review workflow, and exports.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null check (plan in ('enterprise', 'regulated', 'internal')),
  region text not null check (region in ('us', 'eu', 'global')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email citext not null,
  display_name text not null,
  role text not null check (role in ('admin', 'analyst', 'reviewer', 'auditor', 'read_only')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  external_subject text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_id uuid references tenant_users(id) on delete set null,
  actor_email text not null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_tenant_time on audit_log(tenant_id, created_at desc);
create index if not exists idx_audit_log_resource on audit_log(tenant_id, resource_type, resource_id);

create table if not exists enterprise_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_id uuid references tenant_users(id) on delete set null,
  type text not null check (type in ('document_ingestion', 'report_export', 'dossier_export', 'ocr_extraction')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_enterprise_jobs_tenant_status on enterprise_jobs(tenant_id, status, created_at desc);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  external_id text not null,
  title text not null,
  source_type text not null,
  origin text,
  author text,
  publisher text,
  published_at timestamptz,
  acquired_at timestamptz,
  reliability_prior numeric(5,4) not null check (reliability_prior >= 0 and reliability_prior <= 1),
  chain_of_custody_score numeric(5,4) not null check (chain_of_custody_score >= 0 and chain_of_custody_score <= 1),
  primary_source boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

create table if not exists source_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  external_id text not null,
  source_id uuid not null references sources(id) on delete cascade,
  version_number integer not null,
  extraction_method text,
  extraction_confidence numeric(5,4) check (extraction_confidence >= 0 and extraction_confidence <= 1),
  content_hash text not null,
  object_uri text,
  raw_text_uri text,
  created_at timestamptz not null default now(),
  unique (source_id, version_number),
  unique (tenant_id, external_id)
);

create table if not exists ingested_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  external_id text not null,
  job_id uuid references enterprise_jobs(id) on delete set null,
  source_version_id uuid not null references source_versions(id) on delete cascade,
  title text not null,
  mime_type text not null,
  parser_name text not null,
  parser_version text not null,
  content_hash text not null,
  content_text text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references tenant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  external_id text not null,
  ingested_document_id uuid not null references ingested_documents(id) on delete cascade,
  chunk_index integer not null,
  page_number integer,
  section_label text,
  char_start integer not null,
  char_end integer not null,
  text_content text not null,
  content_hash text not null,
  unique (ingested_document_id, chunk_index),
  unique (tenant_id, external_id)
);

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  external_id text not null,
  claim_text text not null,
  subject text,
  predicate text not null,
  object text,
  polarity text not null check (polarity in ('affirmed', 'denied', 'uncertain')),
  modality text not null check (modality in ('asserted_fact', 'allegation', 'opinion', 'forecast', 'quote')),
  canonical_fingerprint text not null,
  public_impact boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, canonical_fingerprint),
  unique (tenant_id, external_id)
);

create table if not exists evidence_spans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  external_id text not null,
  claim_id uuid not null references claims(id) on delete cascade,
  source_version_id uuid not null references source_versions(id) on delete cascade,
  document_chunk_id uuid references document_chunks(id) on delete set null,
  quoted_text text not null,
  evidence_role text not null check (evidence_role in ('supporting', 'contradicting', 'contextual')),
  char_start integer,
  char_end integer,
  extraction_confidence numeric(5,4) check (extraction_confidence >= 0 and extraction_confidence <= 1),
  span_hash text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

create table if not exists truth_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  external_id text not null,
  claim_id uuid not null references claims(id) on delete cascade,
  model_version text not null,
  posterior_truth_score numeric(5,4) not null check (posterior_truth_score >= 0 and posterior_truth_score <= 1),
  confidence_band numeric(5,4) not null check (confidence_band >= 0 and confidence_band <= 1),
  truth_state text not null,
  release_state text not null check (release_state in ('auto_release', 'review_required', 'hold')),
  features jsonb not null,
  explanation jsonb not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

create table if not exists review_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  external_id text not null,
  type text not null,
  status text not null check (status in ('open', 'in_review', 'resolved')),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')),
  subject_id text not null,
  title text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  assigned_to uuid references tenant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

create table if not exists review_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  task_id uuid not null references review_tasks(id) on delete cascade,
  reviewer_id uuid references tenant_users(id) on delete set null,
  reviewer_email text not null,
  decision text not null check (decision in ('approved', 'rejected', 'needs_changes', 'deferred')),
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_id uuid references enterprise_jobs(id) on delete set null,
  export_type text not null check (export_type in ('report', 'dossier')),
  format text not null check (format in ('markdown', 'json', 'html', 'pdf')),
  title text not null,
  object_uri text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references tenant_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sources_tenant on sources(tenant_id, source_type);
create index if not exists idx_claims_tenant_fingerprint on claims(tenant_id, canonical_fingerprint);
create index if not exists idx_evidence_tenant_claim on evidence_spans(tenant_id, claim_id);
create index if not exists idx_assessments_tenant_claim on truth_assessments(tenant_id, claim_id, created_at desc);
create index if not exists idx_review_tasks_tenant_status on review_tasks(tenant_id, status, priority);
create index if not exists idx_exports_tenant_time on exports(tenant_id, created_at desc);
