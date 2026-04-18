# Truth Engine v2 Ingestion Architecture

This phase turns source records into adjudicable claim packages.

## Pipeline

1. Parse source text from raw text or file path.
2. Chunk long source text into bounded windows.
3. Extract candidate atomic claims heuristically from sentences.
4. Bind each claim to an evidence span with source/version metadata.
5. Derive support/contradiction/duplicate relations between extracted claims.
6. Send each claim package through Truth Engine v2 for scoring and release gating.

## Current scope

- Text, Markdown, JSON, and placeholder PDF handling
- Heuristic sentence-based claim extraction
- In-memory ingestion repository
- Real assessment persistence through the existing PostgreSQL repository

## What remains

- Real PDF parsing
- OCR for scanned records
- Model-assisted entity resolution
- Stronger claim canonicalization
- Better contradiction topology
- Claim provenance graph visualization
