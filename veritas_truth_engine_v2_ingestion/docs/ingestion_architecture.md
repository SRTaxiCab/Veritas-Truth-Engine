# Truth Engine v2 Ingestion Architecture

## Pipeline

1. parser normalizes input into text
2. chunker creates stable document segments
3. extractor turns sentences into atomic claim candidates
4. repository persists source, source version, ingested document, chunks, claims, evidence spans, and occurrences
5. relation detector builds contradiction/support edges
6. Truth Engine evaluates each claim
7. risky claims are routed to review

## Current limits

- PDF parsing expects embedded text
- no OCR in this phase
- no NER-backed entity registry writes in this phase
- contradiction detection is heuristic, not model-driven

## Why this still matters

This phase gives ChronoScope a real ingestion spine. Historical records can now be processed into claim/evidence objects and scored, instead of being treated as static text blobs.
