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


## Ingestion phase added

This package now includes:

- `src/ingest/parsers.ts`
- `src/ingest/chunker.ts`
- `src/pipeline/claim-extractor.ts`
- `src/pipeline/relations.ts`
- `src/lib/ingestion-repository.ts`
- `src/lib/document-assessment-service.ts`
- `src/api/ingest-document.ts`
- `app/api/ingest-document/route.ts`

### Run ingestion demo

```bash
npm install
npm run ingest:demo
```

### API payload

```json
{
  "title": "Archive Memo",
  "text": "The archive report states the incident occurred in 1962. Another witness denied the event happened in 1962."
}
```
