# PDF Dossier + Provenance Chain Layer

This phase adds a formal evidence dossier layer on top of the multimodal report system.

## Purpose

Veritas Engine needs a publication-grade dossier output that can be:

- reviewed internally,
- archived as a release artifact,
- attached to claims under dispute,
- circulated as a controlled evidence packet.

The dossier layer converts adjudicated claims into a provenance-first report with:

- executive summary,
- release recommendation,
- chain-of-custody notes,
- claim-by-claim evidence packets,
- provenance path steps,
- final conclusion.

## Architectural additions

### 1. Provenance graph payload
`src/provenance/build-dossier.ts`

Builds a graph payload containing:
- nodes for claims, evidence, sources, assessments, and review tasks
- edges for support, contradiction, derivation, assessment, and review routing
- dossier sections that flatten graph paths into reviewer-readable steps

### 2. Evidence dossier builder
`src/reports/dossier-builder.ts`

Produces an `EvidenceDossierDocument` which extends the existing report model with:
- release recommendation
- chain-of-custody notes
- provenance graph payload

### 3. PDF renderer
`src/reports/pdf-export.ts`
`scripts/render_dossier_pdf.py`

The TypeScript layer writes a JSON payload and invokes a Python ReportLab renderer for the final PDF artifact.

This keeps the dossier generation deterministic and makes the output easier to package in environments where the truth engine already runs mixed TypeScript/Python infrastructure.

### 4. Export API
`src/api/export-dossier.ts`

Creates a dossier from sample claim report records and writes the final artifact to the local `artifacts/` directory.

## Output characteristics

The dossier is designed to be:
- text-heavy but readable,
- formal rather than flashy,
- suitable for internal analytical circulation,
- easy to inspect for provenance chains and claim disputes.

## Why this matters

Veritas Engine is not complete if it can only score and visualize. It must also emit a formal dossier that a human reviewer, historian, investigator, or downstream institution can inspect and archive.
