# Veritas Truth Engine v2 Consolidated

## Purpose
This package consolidates the major Truth Engine v2 subsystem layers into one repo scaffold suitable for ChronoScope integration.

## Included layers
- Core probabilistic adjudication engine
- PostgreSQL persistence and review routing
- OCR scaffold and calibration/benchmark support
- Entity resolution and contradiction graph payloads
- Reviewer workspace scaffolding
- Multimodal evidence and report export
- Provenance dossier and PDF rendering scaffold

## Main entry points
- `src/core/truth-engine-v2.ts` — core adjudication logic
- `src/lib/service.ts` — persistence-backed assessment service
- `src/api/*.ts` — service-facing API handlers
- `app/api/*/route.ts` — Next.js route examples
- `app/*/page.tsx` — lightweight demo pages
- `sql/schema_v2_all.sql` — combined SQL bootstrap file

## Recommended run order
1. Apply `sql/schema_v2_all.sql`
2. Set `DATABASE_URL`
3. Run `npm install`
4. Run `npm run check`
5. Run `npm run build`
6. Run individual demos as needed:
   - `npm run demo`
   - `npm run db:test`
   - `npm run bench`
   - `npm run graph`
   - `npm run reviewer`
   - `npm run multimodal`
   - `npm run report`
   - `npm run dossier`

## Repo state
This is a consolidated engineering scaffold. It is designed to be the clean base for production hardening, not the final immutable release branch.
