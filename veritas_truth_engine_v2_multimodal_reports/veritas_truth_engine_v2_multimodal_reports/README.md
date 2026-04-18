# Veritas Truth Engine v2 PostgreSQL Scaffold

This package extends the Truth Engine v2 scaffold with a real PostgreSQL persistence adapter.

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
- `src/examples/sample-input.ts` — corrected ChronoScope-style example

## Quick start

```bash
npm install
npm run build
npm run demo
```

## Run with PostgreSQL

1. Create a PostgreSQL database.
2. Apply `sql/schema_v2.sql`.
3. Set `DATABASE_URL` in `.env` or your shell.
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

## Recommended next production step

Wire ingestion and claim extraction so this repository receives real claim packages instead of static sample input.


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
- a lightweight ChronoScope-style graph UI page
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
- generate ChronoScope-style evidence reports for review and publication workflows

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
