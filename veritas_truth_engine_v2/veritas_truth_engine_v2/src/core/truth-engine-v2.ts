import { computePosterior } from "./bayes.js";
import { deriveFeatures } from "./features.js";
import { EvaluateClaimInput, ReleaseState, TruthAssessment, TruthState } from "./types.js";

export interface TruthEngineV2Options {
  modelVersion?: string;
  priorTruth?: number;
  thresholds?: {
    stronglySupported: number;
    supported: number;
    unresolved: number;
    contested: number;
    autoRelease: number;
    reviewMinProvenance: number;
    reviewMaxContradiction: number;
    reviewMaxDeception: number;
    holdMinEvidenceSupport: number;
    holdMinProvenance: number;
    holdMaxDeception: number;
  };
}

const DEFAULTS: Required<TruthEngineV2Options> = {
  modelVersion: "truth_engine_v2.0.0",
  priorTruth: 0.50,
  thresholds: {
    stronglySupported: 0.85,
    supported: 0.70,
    unresolved: 0.45,
    contested: 0.25,
    autoRelease: 0.82,
    reviewMinProvenance: 0.75,
    reviewMaxContradiction: 0.35,
    reviewMaxDeception: 0.35,
    holdMinEvidenceSupport: 0.30,
    holdMinProvenance: 0.40,
    holdMaxDeception: 0.70,
  },
};

function classifyTruthState(score: number, t: Required<TruthEngineV2Options>["thresholds"]): TruthState {
  if (score >= t.stronglySupported) return "strongly_supported";
  if (score >= t.supported) return "supported";
  if (score >= t.unresolved) return "mixed_or_unresolved";
  if (score >= t.contested) return "contested";
  return score > 0 ? "likely_false" : "insufficient_evidence";
}

function releaseGate(
  score: number,
  confidenceBand: number,
  features: TruthAssessment["features"],
  publicImpact: boolean,
  t: Required<TruthEngineV2Options>["thresholds"]
): { releaseState: ReleaseState; reviewReasons: string[]; releaseRationale: string[] } {
  const reviewReasons: string[] = [];
  const releaseRationale: string[] = [];

  if (features.evidenceSupport < t.holdMinEvidenceSupport) reviewReasons.push("insufficient_evidence_support");
  if (features.provenanceIntegrity < t.holdMinProvenance) reviewReasons.push("weak_provenance_integrity");
  if (features.deceptionSignal > t.holdMaxDeception) reviewReasons.push("high_deception_signal");
  if (publicImpact) reviewReasons.push("public_impact_claim");
  if (features.contradictionPressure > t.reviewMaxContradiction) reviewReasons.push("elevated_contradiction_pressure");
  if (features.deceptionSignal > t.reviewMaxDeception) reviewReasons.push("elevated_deception_signal");
  if (features.provenanceIntegrity < t.reviewMinProvenance) reviewReasons.push("provenance_below_release_threshold");
  if (confidenceBand < 0.45) reviewReasons.push("low_confidence_band");

  if (
    features.evidenceSupport < t.holdMinEvidenceSupport ||
    features.provenanceIntegrity < t.holdMinProvenance ||
    features.deceptionSignal > t.holdMaxDeception
  ) {
    releaseRationale.push("claim fails hard release-gate minimums");
    return { releaseState: "hold", reviewReasons, releaseRationale };
  }

  if (
    score >= t.autoRelease &&
    features.provenanceIntegrity >= t.reviewMinProvenance &&
    features.contradictionPressure <= t.reviewMaxContradiction &&
    features.deceptionSignal <= t.reviewMaxDeception &&
    !publicImpact
  ) {
    releaseRationale.push("claim meets automatic release thresholds");
    return { releaseState: "auto_release", reviewReasons, releaseRationale };
  }

  releaseRationale.push("claim requires review before release");
  return { releaseState: "review_required", reviewReasons, releaseRationale };
}

export function evaluateClaimV2(input: EvaluateClaimInput, options?: TruthEngineV2Options): TruthAssessment {
  const merged = {
    ...DEFAULTS,
    ...options,
    thresholds: { ...DEFAULTS.thresholds, ...(options?.thresholds ?? {}) },
  };

  if (!input.evidence.length) {
    throw new Error(`Cannot assess claim ${input.claim.id} without evidence.`);
  }

  const derived = deriveFeatures(input);
  const { posterior, confidenceBand } = computePosterior(derived.features, merged.priorTruth);
  const truthState = classifyTruthState(posterior, merged.thresholds);
  const gate = releaseGate(
    posterior,
    confidenceBand,
    derived.features,
    Boolean(input.claim.publicImpact),
    merged.thresholds
  );

  return {
    claimId: input.claim.id,
    modelVersion: merged.modelVersion,
    posteriorTruthScore: posterior,
    confidenceBand,
    truthState,
    releaseState: gate.releaseState,
    features: derived.features,
    explanation: {
      independentSupportingSourceCount: derived.independentSupporting.length,
      independentContradictingSourceCount: derived.independentContradicting.length,
      dependencyCollapseFactor: derived.dependencyCollapseFactor,
      reviewReasons: gate.reviewReasons,
      releaseRationale: gate.releaseRationale,
    },
  };
}
