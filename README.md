# Veritas Truth Engine

Veritas Truth Engine is a truth-assessment and evidence-review scaffold for adjudicating claims, managing provenance, and producing reviewer-ready evidence dossiers.

This repository contains the main consolidated implementation plus earlier subsystem packages used while building the full engine.

## Start Here

The primary package is:

```text
veritas_truth_engine_v2_consolidated/veritas_truth_engine_v2_consolidated
```

It combines the major layers of the system:

- core probabilistic claim adjudication
- PostgreSQL persistence and review routing
- OCR, benchmarking, and calibration support
- entity resolution and contradiction graph payloads
- reviewer workspace scaffolding
- multimodal evidence fusion
- markdown, JSON, HTML, and PDF report export
- provenance dossier generation

## Quick Start

```bash
cd veritas_truth_engine_v2_consolidated/veritas_truth_engine_v2_consolidated
npm install
npm run check
npm test
npm run build
npm run start
```

Then open:

```text
http://localhost:3017
```

The consolidated package expects Node.js `>=22 <23` and npm `>=10`.

## Useful Scripts

Run these from the consolidated package directory.

```bash
npm run demo
npm run bench
npm run graph
npm run reviewer
npm run multimodal
npm run report
npm run dossier
```

For PostgreSQL-backed persistence:

```bash
npm run db:test
```

Set `DATABASE_URL` and apply:

```text
sql/schema_v2_all.sql
```

## Docker

```bash
cd veritas_truth_engine_v2_consolidated/veritas_truth_engine_v2_consolidated
npm run docker:up
```

Docker Desktop should be running in Linux containers mode for the included Node and PostgreSQL images.

## Repository Map

```text
veritas_truth_engine_starter/                 Initial starter scaffold
veritas_truth_engine_v2/                      Core v2 engine package
veritas_truth_engine_v2_full/                 Expanded v2 package
veritas_truth_engine_v2_graph_ui/             Graph UI and entity-resolution layer
veritas_truth_engine_v2_ingestion/            Ingestion-focused package
veritas_truth_engine_v2_multimodal_reports/   Multimodal/reporting layer
veritas_truth_engine_v2_ocr_bench/            OCR and benchmark layer
veritas_truth_engine_v2_pdf_dossier/          PDF dossier layer
veritas_truth_engine_v2_postgres/             PostgreSQL persistence layer
veritas_truth_engine_v2_reviewer_workspace/   Reviewer workspace layer
veritas_truth_engine_v2_consolidated/         Main consolidated package
```

Additional root artifacts:

```text
The Veritas Truth Engine.pdf
veritas_pdf_instructions.txt
```

## Key Documents

Inside the consolidated package:

```text
PROJECT_MAP.md
CONSOLIDATION_NOTES.md
docs/veritas_operations_manual.md
docs/veritas_operations_manual.pdf
docs/DEPLOYMENT_RUNBOOK.md
docs/GLOBAL_MARKET_READINESS.md
docs/truth_engine_v2_spec.md
```

## Project Status

This repository is an engineering scaffold for Veritas Truth Engine development. The consolidated package is the cleanest base for continued production hardening, deployment work, and integration with broader ChronoScope-style intelligence workflows.
