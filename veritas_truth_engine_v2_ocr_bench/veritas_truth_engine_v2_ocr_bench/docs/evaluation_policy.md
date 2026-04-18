# Evaluation and Release Policy

## Objective

The engine must be evaluated as an adjudication system, not a generic classifier.

## Benchmark categories

1. Historical documents with known revision chains
2. Multi-source event narratives with both primary and derivative reports
3. Synthetic false-corroboration bundles
4. Contradiction-heavy archival disputes
5. Mixed-quality current-event corpora

## Primary metrics

- calibration error of posterior truth score
- review precision for genuinely ambiguous claims
- false corroboration reduction rate
- contradiction detection recall
- provenance completeness rate
- release precision for high-impact claims

## Suggested release thresholds

- auto release only if posterior score >= 0.82, provenance integrity >= 0.75, contradiction pressure <= 0.35, deception signal <= 0.35
- review required if posterior score in [0.45, 0.82) or contradiction pressure > 0.35 or deception signal > 0.35
- hold if evidence support < 0.30 or provenance integrity < 0.40 or deception signal > 0.70

## Human review triggers

- public impact
- legal exposure
- contradictory primary sources
- weak chain of custody
- major narrative revision detected
- unresolved chronology conflicts
