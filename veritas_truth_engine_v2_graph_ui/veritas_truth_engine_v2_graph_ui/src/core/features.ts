import {
  CausalLink,
  Claim,
  ClaimRelation,
  EvidenceBundle,
  EvaluateClaimInput,
  EvidenceRole,
  FeatureVector,
  SourceLineageEdge,
  UUID,
} from "./types.js";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function weightedMean(pairs: Array<{ value: number; weight: number }>): number {
  const valid = pairs.filter((p) => p.weight > 0);
  if (!valid.length) return 0;
  const numerator = valid.reduce((sum, p) => sum + p.value * p.weight, 0);
  const denominator = valid.reduce((sum, p) => sum + p.weight, 0);
  return denominator === 0 ? 0 : numerator / denominator;
}

export function splitEvidenceByRole(evidence: EvidenceBundle[]): Record<EvidenceRole, EvidenceBundle[]> {
  return {
    supporting: evidence.filter((e) => e.span.evidenceRole === "supporting"),
    contradicting: evidence.filter((e) => e.span.evidenceRole === "contradicting"),
    contextual: evidence.filter((e) => e.span.evidenceRole === "contextual"),
  };
}

function buildRootMap(evidence: EvidenceBundle[], lineage: SourceLineageEdge[]): Map<UUID, UUID> {
  const parentMap = new Map<UUID, UUID>();
  for (const edge of lineage) {
    if (edge.parentSourceId && edge.confidence >= 0.5) {
      parentMap.set(edge.childSourceId, edge.parentSourceId);
    }
  }

  const rootMap = new Map<UUID, UUID>();
  function findRoot(id: UUID): UUID {
    let current = id;
    const seen = new Set<UUID>();
    while (parentMap.has(current) && !seen.has(current)) {
      seen.add(current);
      current = parentMap.get(current)!;
    }
    return current;
  }

  for (const bundle of evidence) {
    rootMap.set(bundle.source.id, findRoot(bundle.source.id));
  }

  return rootMap;
}

export function dedupeIndependentEvidence(
  evidence: EvidenceBundle[],
  lineage: SourceLineageEdge[] = []
): { independent: EvidenceBundle[]; dependencyCollapseFactor: number } {
  if (!evidence.length) return { independent: [], dependencyCollapseFactor: 1 };

  const rootMap = buildRootMap(evidence, lineage);
  const bestByRoot = new Map<UUID, EvidenceBundle>();

  for (const bundle of evidence) {
    const root = rootMap.get(bundle.source.id) ?? bundle.source.id;
    const current = bestByRoot.get(root);
    const nextScore =
      0.50 * clamp01(bundle.source.reliabilityPrior) +
      0.25 * clamp01(bundle.source.chainOfCustodyScore) +
      0.15 * (bundle.source.primarySource ? 1 : 0.6) +
      0.10 * clamp01(bundle.sourceVersion.extractionConfidence ?? 0.75);

    if (!current) {
      bestByRoot.set(root, bundle);
      continue;
    }

    const currentScore =
      0.50 * clamp01(current.source.reliabilityPrior) +
      0.25 * clamp01(current.source.chainOfCustodyScore) +
      0.15 * (current.source.primarySource ? 1 : 0.6) +
      0.10 * clamp01(current.sourceVersion.extractionConfidence ?? 0.75);

    if (nextScore > currentScore) {
      bestByRoot.set(root, bundle);
    }
  }

  const independent = [...bestByRoot.values()];
  const dependencyCollapseFactor = clamp01(independent.length / evidence.length);
  return { independent, dependencyCollapseFactor };
}

function evidenceSpecificity(bundle: EvidenceBundle): number {
  let score = 0.20;
  const textLen = bundle.span.quotedText.trim().length;
  if (textLen >= 180) score += 0.25;
  else if (textLen >= 90) score += 0.18;
  else if (textLen >= 45) score += 0.12;
  else score += 0.05;

  if (bundle.span.pageNumber != null) score += 0.10;
  if (bundle.span.lineStart != null) score += 0.08;
  if (bundle.span.charStart != null) score += 0.08;
  if (bundle.span.sectionLabel) score += 0.06;
  score += 0.23 * clamp01(bundle.span.extractionConfidence ?? 0.70);

  return clamp01(score);
}

export function scoreEvidenceSupport(claim: Claim, supporting: EvidenceBundle[]): number {
  if (!supporting.length) return 0;
  return clamp01(
    weightedMean(
      supporting.map((bundle) => {
        const sourceWeight =
          0.45 * clamp01(bundle.source.reliabilityPrior) +
          0.25 * clamp01(bundle.source.chainOfCustodyScore) +
          0.15 * (bundle.source.primarySource ? 1 : 0.65) +
          0.15 * clamp01(bundle.sourceVersion.extractionConfidence ?? 0.75);

        const modalityAdj = claim.modality === "asserted_fact" ? 1 : claim.modality === "quote" ? 0.94 : claim.modality === "allegation" ? 0.72 : claim.modality === "opinion" ? 0.50 : 0.42;
        const value = clamp01(evidenceSpecificity(bundle) * modalityAdj * (0.7 + 0.3 * sourceWeight));
        return { value, weight: sourceWeight };
      })
    )
  );
}

export function scoreSourceReliability(independentSupporting: EvidenceBundle[]): number {
  if (!independentSupporting.length) return 0;
  return clamp01(
    mean(
      independentSupporting.map((bundle) =>
        clamp01(
          0.55 * bundle.source.reliabilityPrior +
          0.30 * bundle.source.chainOfCustodyScore +
          0.15 * (bundle.source.primarySource ? 1 : 0.6)
        )
      )
    )
  );
}

export function scoreProvenanceIntegrity(evidence: EvidenceBundle[]): number {
  if (!evidence.length) return 0;
  return clamp01(
    mean(
      evidence.map((bundle) => {
        let score = 0.15;
        if (bundle.source.origin) score += 0.15;
        if (bundle.source.author) score += 0.10;
        if (bundle.source.publishedAt) score += 0.10;
        if (bundle.source.acquiredAt) score += 0.05;
        if (bundle.sourceVersion.contentHash) score += 0.15;
        if (bundle.sourceVersion.versionNumber >= 1) score += 0.05;
        if (bundle.span.pageNumber != null || bundle.span.sectionLabel) score += 0.10;
        score += 0.15 * clamp01(bundle.source.chainOfCustodyScore);
        score += 0.10 * clamp01(bundle.sourceVersion.extractionConfidence ?? 0.75);
        return clamp01(score);
      })
    )
  );
}

export function scoreIndependenceAdjustedCorroboration(
  allSupporting: EvidenceBundle[],
  independentSupporting: EvidenceBundle[]
): number {
  const n = independentSupporting.length;
  if (!n) return 0;

  const base = n === 1 ? 0.34 : n === 2 ? 0.58 : n === 3 ? 0.76 : n === 4 ? 0.87 : 0.94;
  const collapseFactor = clamp01(independentSupporting.length / Math.max(1, allSupporting.length));
  return clamp01(0.7 * base + 0.3 * collapseFactor);
}

function parseDateMaybe(date?: string | null): Date | null {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function scoreTemporalCoherence(claim: Claim, supporting: EvidenceBundle[], contradicting: EvidenceBundle[]): number {
  if (!supporting.length && !contradicting.length) return 0;
  const start = parseDateMaybe(claim.timeStart);
  const end = parseDateMaybe(claim.timeEnd);
  if (start && end && start > end) return 0.03;

  let score = 0.78;

  if (start && supporting.length) {
    const sourceDates = supporting.map((b) => parseDateMaybe(b.source.publishedAt)).filter((d): d is Date => !!d);
    if (sourceDates.length) {
      const allYearsBefore = sourceDates.every((d) => d.getTime() < start.getTime() - 365 * 24 * 60 * 60 * 1000);
      if (allYearsBefore) score -= 0.30;
    }
  }

  const contradictionCount = contradicting.length;
  score -= Math.min(0.25, contradictionCount * 0.06);
  return clamp01(score);
}

export function scoreCausalCoherence(claim: Claim, causalLinks: CausalLink[] = []): number {
  const relevant = causalLinks.filter((c) => c.causeClaimId === claim.id || c.effectClaimId === claim.id);
  if (!relevant.length) return 0.72;
  return clamp01(mean(relevant.map((c) => c.confidence)));
}

export function scoreContradictionPressure(
  claim: Claim,
  contradicting: EvidenceBundle[],
  independentContradicting: EvidenceBundle[],
  claimRelations: ClaimRelation[] = []
): number {
  const evidencePressure = independentContradicting.length
    ? mean(
        independentContradicting.map((bundle) =>
          clamp01(
            0.45 * bundle.source.reliabilityPrior +
            0.20 * bundle.source.chainOfCustodyScore +
            0.20 * evidenceSpecificity(bundle) +
            0.15 * (claim.modality === "asserted_fact" ? 1 : 0.8)
          )
        )
      )
    : 0;

  const relationPressure = claimRelations.length
    ? mean(
        claimRelations
          .filter((r) => r.relationType === "contradicts" || r.relationType === "temporally_conflicts" || r.relationType === "scope_conflicts")
          .map((r) =>
            r.relationType === "contradicts"
              ? clamp01(0.85 * r.confidence + 0.10)
              : clamp01(0.70 * r.confidence + 0.10)
          )
      )
    : 0;

  return clamp01(0.7 * evidencePressure + 0.3 * relationPressure);
}

export function scoreRevisionStability(evidence: EvidenceBundle[]): number {
  if (!evidence.length) return 0;
  return clamp01(
    mean(
      evidence.map((bundle) => {
        let score = 0.55;
        if (bundle.sourceVersion.versionNumber === 1) score += 0.12;
        if (bundle.sourceVersion.supersedesVersionId) score -= 0.08;
        if (bundle.sourceVersion.revisionReason && /correction|retraction|clarification/i.test(bundle.sourceVersion.revisionReason)) score -= 0.12;
        return clamp01(score);
      })
    )
  );
}

function riskMarkerCount(text: string): number {
  const patterns = [
    /\b(allegedly|reportedly|sources say|it is believed|some claim)\b/gi,
    /\b(may have|might have|could have|possibly)\b/gi,
    /\b(obviously|clearly|everyone knows|undeniably)\b/gi,
    /\b(shocking|explosive|devastating|massive)\b/gi,
    /\b(unnamed sources|according to insiders)\b/gi,
  ];
  return patterns.reduce((sum, pattern) => sum + ((text.match(pattern) || []).length), 0);
}

export function scoreDeceptionSignal(evidence: EvidenceBundle[], claimRelations: ClaimRelation[] = []): number {
  if (!evidence.length) return 0.5;
  const linguisticRisk = mean(evidence.map((b) => clamp01(riskMarkerCount(b.span.quotedText) / 6)));
  const provenanceRisk = mean(
    evidence.map((b) => {
      let risk = 0;
      if (!b.source.author) risk += 0.18;
      if (!b.source.origin) risk += 0.18;
      if (!b.source.publishedAt) risk += 0.16;
      if ((b.sourceVersion.extractionConfidence ?? 0.75) < 0.5) risk += 0.22;
      if ((b.span.extractionConfidence ?? 0.75) < 0.5) risk += 0.16;
      if (!b.sourceVersion.contentHash) risk += 0.10;
      return clamp01(risk);
    })
  );
  const instability = claimRelations.length
    ? mean(
        claimRelations
          .filter((r) => r.relationType === "reframes" || r.relationType === "scope_conflicts")
          .map((r) => clamp01(r.confidence))
      )
    : 0;

  return clamp01(0.40 * linguisticRisk + 0.40 * provenanceRisk + 0.20 * instability);
}

export interface DerivedFeatures {
  features: FeatureVector;
  independentSupporting: EvidenceBundle[];
  independentContradicting: EvidenceBundle[];
  dependencyCollapseFactor: number;
}

export function deriveFeatures(input: EvaluateClaimInput): DerivedFeatures {
  const { claim, evidence, sourceLineage = [], claimRelations = [], causalLinks = [] } = input;
  const { supporting, contradicting } = splitEvidenceByRole(evidence);
  const supportDeduped = dedupeIndependentEvidence(supporting, sourceLineage);
  const contradictionDeduped = dedupeIndependentEvidence(contradicting, sourceLineage);

  const features: FeatureVector = {
    evidenceSupport: scoreEvidenceSupport(claim, supporting),
    sourceReliability: scoreSourceReliability(supportDeduped.independent),
    provenanceIntegrity: scoreProvenanceIntegrity(evidence),
    independenceAdjustedCorroboration: scoreIndependenceAdjustedCorroboration(supporting, supportDeduped.independent),
    temporalCoherence: scoreTemporalCoherence(claim, supporting, contradicting),
    causalCoherence: scoreCausalCoherence(claim, causalLinks),
    contradictionPressure: scoreContradictionPressure(claim, contradicting, contradictionDeduped.independent, claimRelations),
    revisionStability: scoreRevisionStability(evidence),
    deceptionSignal: scoreDeceptionSignal(evidence, claimRelations),
  };

  return {
    features,
    independentSupporting: supportDeduped.independent,
    independentContradicting: contradictionDeduped.independent,
    dependencyCollapseFactor: supportDeduped.dependencyCollapseFactor,
  };
}
