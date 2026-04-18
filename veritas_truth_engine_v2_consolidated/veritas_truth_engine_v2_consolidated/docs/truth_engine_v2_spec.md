# Truth Engine v2 Specification

## Mission

Truth Engine v2 is the proprietary adjudication substrate for Veritas Systems. Its purpose is to measure claims against evidence, provenance, chronology, contradiction structure, and adversarial manipulation indicators, then output a calibrated and explainable assessment suitable for historical research, investigative analysis, and deception detection.

## Governing doctrine

No conclusion without evidence.
No evidence without provenance.
No certainty without calibration.
No release without review thresholds.

## Core modules

### 1. Claim Atomizer
Normalizes narrative text into atomic claims with explicit subject, predicate, object, polarity, modality, temporal scope, and location.

### 2. Provenance Binder
Associates every claim with exact evidence spans, source versions, acquisition chain, extraction method, and revision lineage.

### 3. Independence Resolver
Collapses dependent corroboration by identifying reposts, wire copies, quote chains, mirrors, derivative summaries, and coordinated restatements.

### 4. Contradiction Graph
Stores and scores support, contradiction, temporal conflict, scope conflict, and revision conflict as graph edges.

### 5. Temporal-Causal Validator
Checks chronology ordering, event plausibility, actor availability, source revision sequence, and high-level cause/effect coherence.

### 6. Deception Analyzer
Scores linguistic manipulation markers, provenance irregularities, dissemination anomalies, and narrative instability.

### 7. Bayesian Fusion Core
Transforms extracted features into posterior support and calibrated release states.

### 8. Review and Release Gate
Routes claims to human review based on contradiction, deception, public impact, or insufficient confidence.

## Proprietary differentiators

### Independence-adjusted corroboration under provenance constraints
Agreement only counts when the engine can show that agreeing evidence is genuinely independent and traceable.

### Temporal contradiction topology
Contradictions are modeled by time, scope, revision state, and compatibility rather than flat yes/no opposition.

### Release gating
Claims are not automatically promoted merely because their support score is high. Release state also depends on review thresholds, provenance integrity, and unresolved contradiction patterns.

## Recommended product-level truth states

- `strongly_supported`
- `supported`
- `mixed_or_unresolved`
- `contested`
- `likely_false`
- `insufficient_evidence`

## Release states

- `auto_release`
- `review_required`
- `hold`

## High-level scoring axes

- evidence support
- source reliability
- provenance integrity
- independence-adjusted corroboration
- temporal coherence
- causal coherence
- contradiction pressure
- revision stability
- deception signal

## Intended ChronoScope use

ChronoScope should use Truth Engine v2 to:

- reconstruct timeline events from claims
- expose documentary revisions over time
- distinguish primary, secondary, and derivative source pathways
- score historical truth pathways rather than only source popularity
- show contradiction clusters and unresolved historiography
