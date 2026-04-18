# Veritas Truth Engine Starter

This package is a working starter for the Veritas Systems Truth Engine based on a claim-centric, evidence-bound adjudication model.

It follows the Veritas blueprint direction that systems should prioritize source citation, contradiction analysis, provenance, and version-controlled conclusions.

## Included

- `sql/schema.sql` — PostgreSQL schema for sources, claims, evidence, assessments, and review workflow
- `src/lib/weapr_v1.ts` — weighted evidence adjudication and provenance resolution core
- `src/api/assess-claim/route.ts` — Next.js route handler to score a claim and persist the assessment
- `src/genkit/flows/evaluate-claim.ts` — Genkit flow wrapper for the scoring engine
- `src/lib/seed.ts` — starter seed script with one worked example
- `.env.example` — environment variable template

## Core logic

WEAPR v1 computes a claim-level truth score using:

- source reliability
- evidence specificity
- corroboration strength
- temporal consistency
- contradiction pressure
- manipulation signal

The final model output is:

```text
truth_score = support_score * (1 - risk_penalty)
```

Where:

```text
support_score =
    0.30 * source_reliability
  + 0.25 * evidence_specificity
  + 0.30 * corroboration_strength
  + 0.15 * temporal_consistency

risk_penalty =
    0.60 * contradiction_pressure
  + 0.40 * manipulation_signal
```

## Quick start

1. Create a database.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Apply the schema:

```bash
psql "$DATABASE_URL" -f sql/schema.sql
```

4. Install dependencies:

```bash
npm install
```

5. Seed example data:

```bash
npm run seed
```

## Next.js route usage

Example request:

```http
POST /api/assess-claim
Content-Type: application/json

{
  "claimId": "<uuid>",
  "publicImpact": true
}
```

## Recommended next upgrades

- add entity resolution and alias consolidation service
- add semantic claim canonicalization
- add contradiction classifier model
- add source lineage discovery for false corroboration reduction
- add reviewer override and adjudication audit trail
- add dashboards for provenance graph and contradiction heatmaps

## Notes

This is a production-oriented starter, not a finished truth engine. It gives you a solid execution spine for the Veritas stack.
