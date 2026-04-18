create table if not exists benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  run_label text not null,
  total_cases integer not null,
  state_accuracy numeric(6,5) not null,
  band_accuracy numeric(6,5) not null,
  average_score numeric(6,5) not null,
  created_at timestamptz not null default now()
);

create table if not exists calibration_reports (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  ece numeric(6,5) not null,
  mce numeric(6,5) not null,
  brier_score numeric(6,5) not null,
  report_json jsonb not null,
  created_at timestamptz not null default now()
);
