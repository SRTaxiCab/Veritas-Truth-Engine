# Veritas Truth Engine v2 — Ingestion Build

This package extends the PostgreSQL-backed Truth Engine v2 scaffold with document ingestion, heuristic claim extraction, contradiction detection, and document-level assessment routing.

## What is new

- Document ingestion pipeline for text, markdown, JSON, and PDF
- Chunking pipeline for long records
- Heuristic claim extraction tuned for historical and investigative records
- Evidence span creation from chunk/sentence offsets
- Claim relation generation for duplicate/support/contradiction signals
- Document assessment service that persists outputs to PostgreSQL
- API endpoints for ingesting raw text or file paths
- Demo page for ChronoScope-style ingestion

## Core flow

1. ingest document
2. normalize text
3. split into chunks
4. extract atomic claims
5. bind evidence spans
6. detect contradictions and duplicates
7. score claims with Truth Engine v2
8. persist truth assessments and route risky claims to review

## Scripts

```bash
npm install
npm run build
npm run db:test
npm run ingest:demo
```

## Environment

Set `DATABASE_URL` to enable persistence.

## New API examples

- `POST /api/ingest-document`
- `POST /api/assess-document`

## Notes

PDF support uses `pdf-parse`. For scanned PDFs with no embedded text, add OCR in a later phase. This build deliberately avoids OCR so provenance remains cleaner and deterministic.
