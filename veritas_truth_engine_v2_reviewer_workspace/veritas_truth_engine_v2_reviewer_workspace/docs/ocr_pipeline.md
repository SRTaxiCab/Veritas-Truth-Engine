# Truth Engine v2 OCR Pipeline

## Purpose

ChronoScope needs to process scanned historical records, typed memos, low-quality photocopies, and image-derived archival pages. This package adds an OCR abstraction layer so the Truth Engine can normalize extracted text before chunking, claim extraction, and adjudication.

## v2 OCR design

1. Input document enters an OCR adapter.
2. Adapter returns page-aware text, line confidence, and document-level warnings.
3. OCR text is normalized.
4. Low-confidence pages are flagged for review.
5. Normalized text is passed into the ingestion and claim pipeline.

## Included components

- `PassThroughOcrAdapter` for documents where text is already available.
- `HeuristicOcrAdapter` for page splitting, confidence estimation, and warning generation.
- shared OCR types for future integration with cloud OCR or local OCR engines.

## Production recommendation

Replace the heuristic adapter with a real OCR backend that provides:

- page images
- line bounding boxes
- word confidence
- rotation/orientation handling
- handwriting support where needed
- archival metadata retention

## Release rule

If average OCR confidence is weak, Truth Engine assessment should still run, but the claim package should carry OCR warnings into provenance and review routing.
