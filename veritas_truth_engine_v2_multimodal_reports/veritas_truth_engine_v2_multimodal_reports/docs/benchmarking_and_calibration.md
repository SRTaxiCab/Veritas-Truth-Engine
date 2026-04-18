# Truth Engine v2 Benchmarking and Calibration

## Why this matters

A truth engine without measurement is only a narrative. ChronoScope needs quantitative validation so Veritas can defend:

- truth-state assignments
- posterior score ranges
- review thresholds
- release gating decisions

## Included benchmark layer

This package adds:

- labeled benchmark examples
- state accuracy measurement
- score-band pass/fail checks
- calibration report generation
- expected calibration error (ECE)
- maximum calibration error (MCE)
- Brier score

## Intended workflow

1. Build domain-specific benchmark sets.
2. Run `npm run bench`.
3. Review state accuracy and calibration drift.
4. Adjust priors, penalties, and release thresholds.
5. Re-run until performance is stable.

## ChronoScope-specific benchmark categories

- archival record conflict
- witness vs institutional record conflict
- revision lineage detection
- false corroboration collapse
- chronology failure
- propagandistic or anonymous-source degradation

## Hard rule

Do not treat a new model version as production-ready until it is benchmarked against a frozen evaluation set and calibration remains within acceptable drift bounds.
