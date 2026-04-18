create table if not exists canonical_entities_v2 (
    id uuid primary key,
    entity_type text not null,
    canonical_name text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists entity_aliases_v2 (
    id uuid primary key,
    entity_id uuid not null references canonical_entities_v2(id) on delete cascade,
    alias text not null,
    created_at timestamptz not null default now()
);

create table if not exists reviewer_tasks_v2 (
    id uuid primary key,
    task_type text not null,
    status text not null,
    priority text not null,
    subject_id text not null,
    title text not null,
    summary text not null,
    payload jsonb not null default '{}'::jsonb,
    assigned_to text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists reviewer_actions_v2 (
    id uuid primary key default gen_random_uuid(),
    task_id uuid not null references reviewer_tasks_v2(id) on delete cascade,
    reviewer text not null,
    decision text not null,
    notes text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_reviewer_tasks_v2_status_priority
on reviewer_tasks_v2(status, priority);
