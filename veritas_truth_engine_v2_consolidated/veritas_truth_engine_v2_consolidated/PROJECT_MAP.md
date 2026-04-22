# Veritas Truth Engine v2 Consolidated

## Purpose
This package is the main standalone Veritas Engine application. It combines claim adjudication, ingestion, review, reporting, governance, and export surfaces into one runnable local product instead of a loose collection of demos.

## What Runs The Product

### Main app runtime
- `src/examples/server.ts` — local HTTP server, HTML app shell, auth gating, PDF preview route, and operational UI
- `src/examples/pdf-preview.ts` — embedded PDF.js viewer template for the operations manual and latest dossier
- `src/lib/local-auth-store.ts` — local sign-in account and session storage
- `src/lib/enterprise-repository.ts` — enterprise repository contract
- `src/lib/local-store.ts` — local tenant, user, ingestion, review, audit, and job persistence
- `src/lib/postgres-enterprise-repository.ts` — PostgreSQL-backed enterprise repository
- `src/lib/document-ingestion-service.ts` — document parsing, chunking, claim extraction, and assessment packaging

### API layer
- `src/api/ingest-document.ts` — direct and job-based ingestion endpoints
- `src/api/reviewer-workspace.ts` — queue state and review action handling
- `src/api/export-dossier.ts` — dossier preview and PDF artifact export
- `src/api/export-report.ts` — markdown, JSON, and HTML report export
- `src/api/enterprise-admin.ts` — tenant, user, and audit administration
- `src/api/integrations.ts` — explicit external adapter status surface

### Core analysis and evidence
- `src/core/*` — truth engine scoring and release-state evaluation
- `src/pipeline/*` — claim extraction and relation derivation
- `src/ingest/*` — text/PDF parsing and chunking
- `src/review/*` — reviewer task models and workspace building
- `src/reports/*` — report/dossier document assembly
- `src/provenance/*` — provenance chain modeling

## Product Surfaces

### Browser routes
- `/auth` — sign-in and account creation
- `/transition` — startup animation after sign-in
- `/start` — role-based home hub
- `/ingest` — document intake and processing history
- `/results` — findings and claim inspection
- `/review` — reviewer queue
- `/report` — dossier preview and export
- `/settings` — admin, governance, users, tenants, integrations, and operations manual access
- `/pdf-preview` — embedded PDF viewer for supported internal documents

### Key downloads
- `docs/veritas_operations_manual.pdf`
- `docs/veritas_operations_manual.md`
- `artifacts/veritas-evidence-dossier.pdf` when a dossier has been generated

## Automation And Large-File Processing
- `src/automation/bulk-ingestion.ts` — filesystem-based bulk ingestion for large or repeated imports
- `src/examples/bulk-ingest.ts` — CLI entry point for one-time and watch-mode automation
- `automation/inbox/` — default drop folder for automated imports

Useful commands:
- `npm run bulk:ingest`
- `npm run bulk:watch`

## External Integration Boundary
- `src/integrations/types.ts` — adapter contract types
- `src/integrations/registry.ts` — adapter registry
- `src/integrations/chronoscope/adapter.ts` — inactive planned ChronoScope placeholder

Rule: downstream systems do not import directly into core engine, repository, or UI logic. They enter through `src/integrations/*`.

## Operational Scripts
- `npm run dev:ui:watch` — local development server with restart/watch behavior
- `npm run check` — TypeScript validation
- `npm run test` — scripted test suite
- `npm run verify:server` — HTTP smoke verification
- `npm run manual:pdf` — regenerate the operations manual PDF
- `npm run reset:system` — clear local/generated runtime state
- `npm run open:dossier`
- `npm run open:manual`
- `npm run open:dossier:view`
- `npm run open:manual:view`

## Important Directories
- `docs/` — runbooks, architecture notes, operations manual, and screenshots
- `public/assets/` — logos and intro media
- `public/pdfjs/` — vendored PDF.js runtime for embedded preview
- `sql/` — schema bootstrap files
- `data/` — local runtime state when not using PostgreSQL
- `artifacts/` — generated PDF outputs

## Recommended Onboarding Order
1. Read `README.md`
2. Read `PROJECT_MAP.md`
3. Run `npm install`
4. Run `npm run check`
5. Start the app with `npm run dev:ui:watch`
6. Open `http://localhost:3017/auth`
7. Use `docs/veritas_operations_manual.pdf` for role-based workflow guidance

## Repo State
This is the actively consolidated package. It is no longer just a scaffold; it is the main working Veritas product surface. Production hardening is still ongoing, especially around authorization, operational durability, and integration maturity.
