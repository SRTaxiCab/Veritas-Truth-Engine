
# Veritas Truth Engine v2 Consolidated

This package is the consolidated standalone Veritas Truth Engine application.

Current supported runtime:

```bash
npm install
npm run check
npm test
npm run build
npm run start
```

Local PDF features also require Python packages in the same interpreter that `python` resolves to:

```bash
python -m pip install reportlab pypdf
```

`reportlab` is used for dossier PDF export. `pypdf` is used when ingesting uploaded PDF documents.

Open:

```text
http://localhost:3017
```

For active development with automatic server restart and browser refresh:

```bash
npm run dev:ui:watch
```

For large-file or batch automation, use the filesystem inbox instead of pushing everything through the browser:

```bash
npm run bulk:ingest
npm run bulk:watch
```

Default bulk-ingestion inbox:

```text
automation/inbox
```

Supported automated import formats:

- `.txt`
- `.md`
- `.json`
- `.pdf`

Useful flags:

```bash
npm run bulk:ingest -- --path "C:\\data\\veritas-drop"
npm run bulk:ingest -- --public-impact
npm run bulk:watch -- --poll-ms 15000
```

Open PDF artifacts in a real viewer instead of printing binary data in the terminal:

```bash
npm run open:dossier
npm run open:manual
```

If the dev server is already running, you can also open the embedded browser viewer:

```bash
npm run open:dossier:view
npm run open:manual:view
```

Operational documents:

- `docs/veritas_operations_manual.pdf`
- `docs/veritas_operations_manual.md`
- `docs/DEPLOYMENT_RUNBOOK.md`
- `docs/GLOBAL_MARKET_READINESS.md`
- `docs/GLOBAL_RELEASE_PLAN.md`

Production-style persistence uses `VERITAS_REPOSITORY=postgres`, `DATABASE_URL`, and `sql/schema_enterprise.sql`. Local development uses `data/veritas-store.json`.

External system boundaries now live under `src/integrations/*`. Veritas stays standalone by default, and any future downstream system must be added through an explicit adapter in that folder instead of leaking integration logic into core, API, or repository code.

Container run:

```bash
npm run docker:up
```

Docker Desktop must be in Linux containers mode for the included Node and Postgres images.

It combines the major subsystem layers built so far:
- core adjudication
- persistence
- OCR + benchmarking
- entity resolution + contradiction graph
- reviewer workspace
- multimodal evidence + report export
- provenance dossier + PDF rendering
- explicit external-integration boundary

## Integration Boundary

The current integration registry is intentionally conservative:

- `src/integrations/registry.ts` owns the list of external adapters
- `src/integrations/chronoscope/adapter.ts` is a planned placeholder, not a live dependency
- `src/api/integrations.ts` exposes adapter status for the standalone admin surface

This keeps Veritas shippable on its own while leaving a clean seam for future ChronoScope hookup work.

For a quick orientation, read `PROJECT_MAP.md` first.
For the full schema bootstrap, use `sql/schema_v2_all.sql`.

---
# Legacy v2 PostgreSQL Scaffold Notes

The original v2 scaffold included a standalone PostgreSQL adapter for direct claim assessment persistence. The current consolidated application uses the enterprise repository for document ingestion, tenants, jobs, review tasks, audit events, dossier previews, and report records.

Use `sql/schema_enterprise.sql` for the current enterprise repository path.

The legacy direct-assessment path uses `sql/schema_v2.sql` and writes to `truth_assessments_v2` plus `review_queue`. It is disabled by default in enterprise PostgreSQL mode. Enable it only when the legacy schema is present:

```bash
VERITAS_ASSESSMENT_REPOSITORY=legacy-postgres
```

What changed:

- `pg` connection layer
- `PostgresTruthEngineRepository`
- persistence for `truth_assessments_v2`
- automatic `review_queue` insertion for non-auto-release claims
- fixed sample payloads and demo server field names
- PostgreSQL demo script

## Files added or upgraded

- `src/lib/db.ts` — PostgreSQL pool helper
- `src/lib/repository.ts` — in-memory and PostgreSQL repositories
- `src/lib/service.ts` — assess + persist + review routing
- `src/api/assess-claim.ts` — API handler with DB-aware persistence
- `src/examples/postgres-demo.ts` — end-to-end persistence demo
- `src/examples/sample-input.ts` — corrected standalone example

## Legacy direct-assessment quick start

```bash
npm install
npm run build
npm run demo
```

## Run the legacy direct-assessment adapter with PostgreSQL

1. Create a PostgreSQL database.
2. Apply `sql/schema_v2.sql`.
3. Set `DATABASE_URL` and `VERITAS_ASSESSMENT_REPOSITORY=legacy-postgres` in `.env` or your shell.
4. Run:

```bash
npm run db:test
```

This will:
- score the sample claim
- insert a row into `truth_assessments_v2`
- insert review queue rows when the release state is not `auto_release`

## Environment

See `.env.example`.

## Current production path

For production-style operation, use document ingestion and the enterprise repository path documented in `docs/DEPLOYMENT_RUNBOOK.md`.


## OCR + benchmark layer

This package now includes:

- OCR abstraction interfaces and heuristic OCR normalization
- benchmark datasets and scoring metrics
- calibration reporting (ECE, MCE, Brier score)
- schema extensions for benchmark and calibration storage

Run:

```bash
npm run bench
```

This prints a benchmark summary and calibration report for the included seed dataset.


## Entity resolution + contradiction graph layer

This package now includes:

- deterministic entity normalization and alias clustering
- claim/entity/source graph payload generation
- timeline payload generation
- a graph demo script
- a lightweight standalone graph UI page
- SQL extensions for canonical entities and graph edges

Run:

```bash
npm run graph
```


## Reviewer workspace layer

- Run `npm run reviewer` for a review-task demo
- Open `/reviewer-workspace` for the lightweight reviewer queue UI
- Apply `sql/schema_v2_reviewer_extensions.sql` for reviewer persistence tables


## v2.6 additions

This package now includes a multimodal evidence layer and a report export layer.

### New capabilities

- fuse text, table, and figure evidence into a structural support summary
- export adjudicated claim packages as markdown, JSON, or HTML
- generate Veritas evidence reports for review and publication workflows

### New scripts

```bash
npm run multimodal
npm run report
```

### New files

- `src/multimodal/types.ts`
- `src/multimodal/table-extractor.ts`
- `src/multimodal/image-evidence.ts`
- `src/multimodal/evidence-fusion.ts`
- `src/reports/types.ts`
- `src/reports/report-builder.ts`
- `src/reports/markdown-export.ts`
- `src/reports/json-export.ts`
- `src/reports/html-export.ts`
- `src/api/export-report.ts`
- `src/examples/multimodal-demo.ts`
- `src/examples/report-demo.ts`
- `app/api/export-report/route.ts`
- `app/report-studio/page.tsx`
- `docs/multimodal_evidence.md`
- `docs/report_export.md`
- `sql/schema_v2_multimodal_report_extensions.sql`
