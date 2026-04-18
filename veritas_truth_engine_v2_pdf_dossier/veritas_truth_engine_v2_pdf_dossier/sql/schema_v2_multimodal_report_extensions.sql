create table if not exists claim_multimodal_evidence_v2 (
    id uuid primary key default gen_random_uuid(),
    claim_id uuid not null,
    modality text not null, -- table, image, timeline, mixed
    summary text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists exported_reports_v2 (
    id uuid primary key default gen_random_uuid(),
    report_title text not null,
    product text not null,
    subject text,
    format text not null, -- markdown, json, html, pdf_future
    content text not null,
    created_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_claim_multimodal_evidence_v2_claim_id
on claim_multimodal_evidence_v2(claim_id);

create index if not exists idx_exported_reports_v2_product_created
on exported_reports_v2(product, created_at desc);
