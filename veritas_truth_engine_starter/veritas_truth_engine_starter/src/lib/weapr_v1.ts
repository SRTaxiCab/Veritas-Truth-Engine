export type UUID = string;

export type TruthState =
  | "strongly_supported"
  | "supported"
  | "unresolved"
  | "contested"
  | "likely_false";

export type EvidenceRole = "supporting" | "contradicting" | "contextual";

export interface Source {
  id: UUID;
  title: string;
  sourceType: string;
  origin?: string | null;
  author?: string | null;
  publisher?: string | null;
  publishedAt?: string | null;
  reliabilityPrior: number;
  chainOfCustodyScore: number;
}

export interface SourceVersion {
  id: UUID;
  sourceId: UUID;
  versionNumber: number;
  extractionMethod?: string | null;
  extractionConfidence?: number | null;
  contentHash: string;
}

export interface Claim {
  id: UUID;
  claimText: string;
  subjectEntityId?: UUID | null;
  predicate: string;
  objectEntityId?: UUID | null;
  objectLiteral?: string | null;
  polarity: "affirmed" | "denied" | "uncertain";
  modality: "asserted_fact" | "allegation" | "opinion" | "forecast" | "quote";
  timeStart?: string | null;
  timeEnd?: string | null;
  canonicalFingerprint: string;
}

export interface EvidenceSpan {
  id: UUID;
  claimId: UUID;
  sourceVersionId: UUID;
  pageNumber?: number | null;
  sectionLabel?: string | null;
  charStart?: number | null;
  charEnd?: number | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  quotedText: string;
  evidenceRole: EvidenceRole;
  extractionConfidence?: number | null;
}

export interface SourceLineageEdge {
  childSourceId: UUID;
  parentSourceId?: UUID | null;
  lineageType: "repost" | "wire_copy" | "quote_chain" | "mirror" | "summary_of" | "derived_from";
  confidence: number;
}

export interface ClaimRelation {
  fromClaimId: UUID;
  toClaimId: UUID;
  relationType:
    | "supports"
    | "partially_supports"
    | "contradicts"
    | "temporally_conflicts"
    | "context_conflicts"
    | "duplicate"
    | "unrelated";
  confidence: number;
}

export interface EvidenceBundle {
  span: EvidenceSpan;
  sourceVersion: SourceVersion;
  source: Source;
}

export interface AssessmentFeatures {
  sourceReliability: number;
  evidenceSpecificity: number;
  corroborationStrength: number;
  temporalConsistency: number;
  contradictionPressure: number;
  manipulationSignal: number;
}

export interface AssessmentResult {
  claimId: UUID;
  modelVersion: string;
  truthScore: number;
  truthState: TruthState;
  supportScore: number;
  riskPenalty: number;
  features: AssessmentFeatures;
  explanation: {
    supportingSourceCount: number;
    contradictingSourceCount: number;
    independentSupportingSourceCount: number;
    independentContradictingSourceCount: number;
    triggeredReview: boolean;
    reviewReasons: string[];
  };
}

export interface EvaluateClaimInput {
  claim: Claim;
  evidence: EvidenceBundle[];
  relatedClaimRelations?: ClaimRelation[];
  sourceLineage?: SourceLineageEdge[];
  publicImpact?: boolean;
}

export interface WeaprOptions {
  modelVersion?: string;
  thresholds?: {
    stronglySupported: number;
    supported: number;
    unresolved: number;
    contested: number;
  };
  weights?: {
    support: {
      sourceReliability: number;
      evidenceSpecificity: number;
      corroborationStrength: number;
      temporalConsistency: number;
    };
    risk: {
      contradictionPressure: number;
      manipulationSignal: number;
    };
  };
}

const DEFAULT_OPTIONS: Required<WeaprOptions> = {
  modelVersion: "weapr_v1.0.0",
  thresholds: {
    stronglySupported: 0.85,
    supported: 0.70,
    unresolved: 0.45,
    contested: 0.25,
  },
  weights: {
    support: {
      sourceReliability: 0.30,
      evidenceSpecificity: 0.25,
      corroborationStrength: 0.30,
      temporalConsistency: 0.15,
    },
    risk: {
      contradictionPressure: 0.60,
      manipulationSignal: 0.40,
    },
  },
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function weightedMean(pairs: Array<{ value: number; weight: number }>): number {
  const valid = pairs.filter((p) => p.weight > 0);
  if (!valid.length) return 0;
  const numerator = valid.reduce((sum, p) => sum + p.value * p.weight, 0);
  const denominator = valid.reduce((sum, p) => sum + p.weight, 0);
  return denominator === 0 ? 0 : numerator / denominator;
}

function quoteLengthScore(text: string): number {
  const len = text.trim().length;
  if (len >= 280) return 1.0;
  if (len >= 160) return 0.9;
  if (len >= 80) return 0.75;
  if (len >= 40) return 0.55;
  return 0.30;
}

function structureSpecificityScore(span: EvidenceSpan): number {
  let score = 0.25;
  if (span.pageNumber !== null && span.pageNumber !== undefined) score += 0.15;
  if (span.lineStart !== null && span.lineStart !== undefined) score += 0.10;
  if (span.charStart !== null && span.charStart !== undefined) score += 0.10;
  if (span.sectionLabel) score += 0.10;
  if (span.extractionConfidence !== null && span.extractionConfidence !== undefined) {
    score += 0.20 * clamp01(span.extractionConfidence);
  }
  return clamp01(score);
}

function modalityPenalty(modality: Claim["modality"]): number {
  switch (modality) {
    case "asserted_fact": return 1.0;
    case "quote": return 0.95;
    case "allegation": return 0.70;
    case "opinion": return 0.45;
    case "forecast": return 0.35;
    default: return 0.50;
  }
}

function polarityConflictMultiplier(polarity: Claim["polarity"]): number {
  switch (polarity) {
    case "affirmed": return 1.0;
    case "denied": return 0.9;
    case "uncertain": return 0.7;
    default: return 0.8;
  }
}

function buildLineageRootMap(
  sources: Source[],
  lineageEdges: SourceLineageEdge[]
): Map<UUID, UUID> {
  const parentMap = new Map<UUID, UUID>();

  for (const edge of lineageEdges) {
    if (edge.parentSourceId && edge.confidence >= 0.5) {
      parentMap.set(edge.childSourceId, edge.parentSourceId);
    }
  }

  function findRoot(sourceId: UUID): UUID {
    let current = sourceId;
    const seen = new Set<UUID>();
    while (parentMap.has(current) && !seen.has(current)) {
      seen.add(current);
      current = parentMap.get(current)!;
    }
    return current;
  }

  const rootMap = new Map<UUID, UUID>();
  for (const source of sources) {
    rootMap.set(source.id, findRoot(source.id));
  }
  return rootMap;
}

function dedupeIndependentEvidence(
  bundles: EvidenceBundle[],
  lineageEdges: SourceLineageEdge[]
): EvidenceBundle[] {
  const sources = bundles.map((b) => b.source);
  const rootMap = buildLineageRootMap(sources, lineageEdges);
  const bestByRoot = new Map<UUID, EvidenceBundle>();

  for (const bundle of bundles) {
    const root = rootMap.get(bundle.source.id) ?? bundle.source.id;
    const current = bestByRoot.get(root);
    const currentScore = current ? current.source.reliabilityPrior * current.source.chainOfCustodyScore : -1;
    const nextScore = bundle.source.reliabilityPrior * bundle.source.chainOfCustodyScore;

    if (!current || nextScore > currentScore) {
      bestByRoot.set(root, bundle);
    }
  }

  return [...bestByRoot.values()];
}

function scoreSourceReliability(bundles: EvidenceBundle[], claim: Claim): number {
  const pairs = bundles.map((b) => {
    const sourceBase = 0.75 * clamp01(b.source.reliabilityPrior) + 0.25 * clamp01(b.source.chainOfCustodyScore);
    const extractionAdj = b.sourceVersion.extractionConfidence !== null && b.sourceVersion.extractionConfidence !== undefined
      ? 0.85 + 0.15 * clamp01(b.sourceVersion.extractionConfidence)
      : 1.0;
    const modalityAdj = modalityPenalty(claim.modality);
    const value = clamp01(sourceBase * extractionAdj * modalityAdj);
    return { value, weight: 1.0 };
  });

  return clamp01(weightedMean(pairs));
}

function scoreEvidenceSpecificity(bundles: EvidenceBundle[], claim: Claim): number {
  const pairs = bundles.map((b) => {
    const quoteScore = quoteLengthScore(b.span.quotedText);
    const structureScore = structureSpecificityScore(b.span);
    const modalityAdj = modalityPenalty(claim.modality);
    const value = clamp01(0.45 * quoteScore + 0.35 * structureScore + 0.20 * modalityAdj);
    const weight = (b.span.extractionConfidence ?? 0.7) * (b.sourceVersion.extractionConfidence ?? 0.8);
    return { value, weight: clamp01(weight) };
  });

  return clamp01(weightedMean(pairs));
}

function scoreCorroborationStrength(independentSupportingBundles: EvidenceBundle[]): number {
  const n = independentSupportingBundles.length;
  if (n <= 0) return 0;
  if (n === 1) return 0.35;
  if (n === 2) return 0.60;
  if (n === 3) return 0.78;
  if (n === 4) return 0.88;
  return 0.95;
}

function parseDateMaybe(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function scoreTemporalConsistency(claim: Claim, supporting: EvidenceBundle[], contradicting: EvidenceBundle[]): number {
  const claimStart = parseDateMaybe(claim.timeStart);
  const claimEnd = parseDateMaybe(claim.timeEnd);

  if (!claimStart && !claimEnd) return 0.75;
  const supportDates = supporting.map((b) => parseDateMaybe(b.source.publishedAt)).filter((d): d is Date => !!d);
  const contradictionDates = contradicting.map((b) => parseDateMaybe(b.source.publishedAt)).filter((d): d is Date => !!d);

  let score = 0.80;
  if (claimStart && claimEnd && claimStart > claimEnd) return 0.05;

  if (claimStart && supportDates.length > 0) {
    const allTooEarly = supportDates.every((d) => d.getTime() < claimStart.getTime() - 1000 * 60 * 60 * 24 * 365);
    if (allTooEarly) score -= 0.35;
  }

  if (contradictionDates.length > 0) {
    score -= Math.min(0.25, contradictionDates.length * 0.05);
  }

  return clamp01(score);
}

function scoreContradictionPressure(
  contradictingBundles: EvidenceBundle[],
  independentContradictingBundles: EvidenceBundle[],
  relations: ClaimRelation[],
  claim: Claim
): number {
  if (contradictingBundles.length === 0 && relations.length === 0) return 0;

  const evidencePressure = mean(
    independentContradictingBundles.map((b) => {
      const credibility = 0.7 * clamp01(b.source.reliabilityPrior) + 0.3 * clamp01(b.source.chainOfCustodyScore);
      const directness = structureSpecificityScore(b.span);
      const modalityAdj = modalityPenalty(claim.modality);
      return clamp01(credibility * 0.5 + directness * 0.3 + modalityAdj * 0.2);
    })
  );

  const relationPressure = mean(
    relations
      .filter((r) => r.relationType === "contradicts" || r.relationType === "temporally_conflicts")
      .map((r) => r.relationType === "contradicts" ? clamp01(0.8 * r.confidence + 0.2) : clamp01(0.7 * r.confidence + 0.15))
  );

  return clamp01(0.7 * evidencePressure + 0.3 * relationPressure);
}

function countTextRiskMarkers(text: string): number {
  const patterns = [
    /\b(allegedly|reportedly|sources say|it is believed|some claim)\b/gi,
    /\b(may have|might have|could have|possibly)\b/gi,
    /\b(obviously|clearly|everyone knows|undeniably)\b/gi,
    /\b(shocking|explosive|massive|devastating)\b/gi,
    /\b(no evidence provided|unnamed sources)\b/gi,
  ];

  let hits = 0;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    hits += match ? match.length : 0;
  }
  return hits;
}

function scoreManipulationSignal(supporting: EvidenceBundle[], contradicting: EvidenceBundle[], claim: Claim): number {
  const allBundles = [...supporting, ...contradicting];
  if (allBundles.length === 0) return 0.5;

  const textRisk = mean(allBundles.map((b) => clamp01(countTextRiskMarkers(b.span.quotedText) / 6)));
  const provenanceRisk = mean(
    allBundles.map((b) => {
      let risk = 0;
      if (!b.source.author) risk += 0.20;
      if (!b.source.origin) risk += 0.20;
      if (!b.source.publishedAt) risk += 0.20;
      if ((b.sourceVersion.extractionConfidence ?? 0.8) < 0.5) risk += 0.20;
      if ((b.span.extractionConfidence ?? 0.8) < 0.5) risk += 0.20;
      return clamp01(risk);
    })
  );

  const modalityRisk = claim.modality === "asserted_fact" ? 0.10
    : claim.modality === "quote" ? 0.15
    : claim.modality === "allegation" ? 0.40
    : claim.modality === "opinion" ? 0.60
    : 0.75;

  return clamp01(0.40 * textRisk + 0.35 * provenanceRisk + 0.25 * modalityRisk);
}

function classifyTruthState(score: number, thresholds: Required<WeaprOptions>["thresholds"]): TruthState {
  if (score >= thresholds.stronglySupported) return "strongly_supported";
  if (score >= thresholds.supported) return "supported";
  if (score >= thresholds.unresolved) return "unresolved";
  if (score >= thresholds.contested) return "contested";
  return "likely_false";
}

function splitEvidenceByRole(evidence: EvidenceBundle[]) {
  const supporting = evidence.filter((e) => e.span.evidenceRole === "supporting");
  const contradicting = evidence.filter((e) => e.span.evidenceRole === "contradicting");
  const contextual = evidence.filter((e) => e.span.evidenceRole === "contextual");
  return { supporting, contradicting, contextual };
}

export function evaluateClaim(input: EvaluateClaimInput, options?: WeaprOptions): AssessmentResult {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
    thresholds: { ...DEFAULT_OPTIONS.thresholds, ...(options?.thresholds ?? {}) },
    weights: {
      support: { ...DEFAULT_OPTIONS.weights.support, ...(options?.weights?.support ?? {}) },
      risk: { ...DEFAULT_OPTIONS.weights.risk, ...(options?.weights?.risk ?? {}) },
    },
  };

  const { claim, evidence, relatedClaimRelations = [], sourceLineage = [], publicImpact = false } = input;
  if (!evidence.length) throw new Error(`Cannot evaluate claim ${claim.id} without evidence.`);

  const { supporting, contradicting } = splitEvidenceByRole(evidence);
  if (!supporting.length && !contradicting.length) {
    throw new Error(`Claim ${claim.id} has evidence, but none marked as supporting or contradicting.`);
  }

  const independentSupporting = dedupeIndependentEvidence(supporting, sourceLineage);
  const independentContradicting = dedupeIndependentEvidence(contradicting, sourceLineage);

  const sourceReliability = scoreSourceReliability(independentSupporting, claim);
  const evidenceSpecificity = scoreEvidenceSpecificity(supporting, claim);
  const corroborationStrength = scoreCorroborationStrength(independentSupporting);
  const temporalConsistency = scoreTemporalConsistency(claim, supporting, contradicting);
  const contradictionPressure = scoreContradictionPressure(contradicting, independentContradicting, relatedClaimRelations, claim);
  const manipulationSignal = scoreManipulationSignal(supporting, contradicting, claim);

  const supportScore = clamp01(
    merged.weights.support.sourceReliability * sourceReliability +
    merged.weights.support.evidenceSpecificity * evidenceSpecificity +
    merged.weights.support.corroborationStrength * corroborationStrength +
    merged.weights.support.temporalConsistency * temporalConsistency
  );

  const riskPenalty = clamp01(
    merged.weights.risk.contradictionPressure * contradictionPressure +
    merged.weights.risk.manipulationSignal * manipulationSignal
  );

  let truthScore = clamp01(supportScore * (1 - riskPenalty));
  truthScore = clamp01(truthScore * polarityConflictMultiplier(claim.polarity));
  const truthState = classifyTruthState(truthScore, merged.thresholds);

  const reviewReasons: string[] = [];
  if (contradictionPressure > 0.55) reviewReasons.push("high_contradiction");
  if (manipulationSignal > 0.65) reviewReasons.push("high_manipulation");
  if (truthState === "unresolved") reviewReasons.push("unresolved");
  if (publicImpact && truthScore < 0.85) reviewReasons.push("public_impact_requires_review");

  return {
    claimId: claim.id,
    modelVersion: merged.modelVersion,
    truthScore,
    truthState,
    supportScore,
    riskPenalty,
    features: {
      sourceReliability,
      evidenceSpecificity,
      corroborationStrength,
      temporalConsistency,
      contradictionPressure,
      manipulationSignal,
    },
    explanation: {
      supportingSourceCount: supporting.length,
      contradictingSourceCount: contradicting.length,
      independentSupportingSourceCount: independentSupporting.length,
      independentContradictingSourceCount: independentContradicting.length,
      triggeredReview: reviewReasons.length > 0,
      reviewReasons,
    },
  };
}
