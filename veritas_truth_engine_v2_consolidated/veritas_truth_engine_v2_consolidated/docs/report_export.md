# Report Export Layer

This layer converts adjudicated claims into publication-grade research outputs.

## Export formats

- Markdown
- JSON
- HTML

## Standalone Purpose

Veritas Engine needs to move from raw adjudication to researcher-facing artifacts that can be reviewed, archived, versioned, and eventually rendered into PDF.

## Current implementation

- `report-builder.ts` creates a normalized report document
- `markdown-export.ts` renders source-friendly reports
- `json-export.ts` renders API-safe machine output
- `html-export.ts` renders browser-ready narrative reports

## Recommended next step

Add PDF rendering on top of HTML output once the report schema is stable.
