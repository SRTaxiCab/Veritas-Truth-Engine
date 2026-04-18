# Veritas Truth Engine v2

Veritas Truth Engine v2 is a claim-centric adjudication scaffold for historical analysis, contradiction detection, provenance scoring, and deception-aware truth assessment. It is designed for Veritas Systems products, especially ChronoScope, where timeline reconstruction and source lineage matter as much as simple content agreement.

This is not an "absolute truth" machine. It is an explainable adjudication system that scores claims against evidence, provenance, source independence, temporal coherence, causal coherence, contradiction pressure, revision stability, and deception signals. That makes it materially stronger and more defensible than generic summarization or binary fact-checking systems. This design direction is consistent with the Veritas operational blueprint and the Rediscover.ai / DeceptionOS concept documents. fileciteturn0file0 fileciteturn0file1

## What is included

- `sql/schema_v2.sql` — PostgreSQL schema for claims, evidence, source lineage, revisions, assessments, and review policy
- `src/core/types.ts` — strong types for claims, evidence, source lineage, chronology, and adjudication
- `src/core/features.ts` — feature extractors for support, provenance integrity, independence-adjusted corroboration, temporal coherence, causal coherence, contradiction pressure, revision stability, and deception signals
- `src/core/bayes.ts` — Bayesian-style posterior fusion helpers
- `src/core/truth-engine-v2.ts` — orchestration layer for adjudication and release gating
- `src/api/assess-claim.ts` — API handler example
- `src/examples/demo.ts` — executable example with historical-style sample data
- `docs/truth_engine_v2_spec.md` — system specification and proprietary feature definitions
- `docs/evaluation_policy.md` — benchmark and release threshold policy

## Core outputs

Each assessed claim returns:

- truth state
- posterior truth score
- confidence band
- support evidence list
- contradiction evidence list
- independent source counts
- provenance integrity score
- temporal coherence score
- causal coherence score
- deception score
- release decision
- review reasons
- explanation trace

## Quick start

```bash
npm install
npm run demo
```

## Intended next integration steps

1. Connect the schema to your production database.
2. Replace sample source priors with calibrated priors by domain.
3. Feed extracted claims and evidence spans from your ingestion / OCR pipeline.
4. Persist assessments and route unresolved or high-risk claims to review.
5. Surface the explanation trace, provenance graph, and contradiction graph in ChronoScope.

## Important limits

This engine does not and cannot guarantee metaphysical certainty. It adjudicates based on available evidence and explicit uncertainty. That is a strength, not a weakness.
