# Multimodal Evidence Layer

Truth Engine v2.6 extends claim adjudication beyond plain text.

## Supported modalities

- Text evidence spans
- Table evidence extracted from archival records, spreadsheets, and appendices
- Image or figure evidence such as charts, timelines, maps, and scanned annotations

## Core principle

Non-textual evidence does not replace provenance-bound text. It strengthens or weakens a claim only when it is linked back to a source packet and represented as structured evidence.

## Current implementation

The v2.6 build provides:

- `table-extractor.ts` for matrix-to-table evidence conversion
- `image-evidence.ts` for figure region evidence packets
- `evidence-fusion.ts` for structural support scoring across modalities

## Near-term production upgrades

- native spreadsheet/table parser integration
- chart-to-claim feature extraction
- figure caption grounding
- page-region provenance references
- image OCR region binding
