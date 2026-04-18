import { FeatureVector } from "./types.js";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toLikelihood(value: number, floor = 0.15, ceil = 0.95): number {
  return clamp01(floor + (ceil - floor) * clamp01(value));
}

export interface PosteriorResult {
  posterior: number;
  confidenceBand: number;
}

export function computePosterior(features: FeatureVector, priorTruth = 0.50): PosteriorResult {
  const supportLikelihoods = [
    toLikelihood(features.evidenceSupport, 0.20, 0.96),
    toLikelihood(features.sourceReliability, 0.20, 0.92),
    toLikelihood(features.provenanceIntegrity, 0.15, 0.94),
    toLikelihood(features.independenceAdjustedCorroboration, 0.20, 0.95),
    toLikelihood(features.temporalCoherence, 0.20, 0.90),
    toLikelihood(features.causalCoherence, 0.20, 0.88),
    toLikelihood(features.revisionStability, 0.20, 0.86),
  ];

  const penaltyLikelihoods = [
    1 - toLikelihood(features.contradictionPressure, 0.10, 0.82),
    1 - toLikelihood(features.deceptionSignal, 0.10, 0.86),
  ];

  const supportProduct = supportLikelihoods.reduce((acc, v) => acc * v, 1);
  const penaltyProduct = penaltyLikelihoods.reduce((acc, v) => acc * v, 1);
  const raw = clamp01(priorTruth * supportProduct * penaltyProduct * 10);

  const uncertaintyComponents = [
    Math.abs(features.evidenceSupport - 0.5),
    Math.abs(features.sourceReliability - 0.5),
    Math.abs(features.provenanceIntegrity - 0.5),
    Math.abs(features.temporalCoherence - 0.5),
    Math.abs(features.causalCoherence - 0.5),
    Math.abs((1 - features.contradictionPressure) - 0.5),
    Math.abs((1 - features.deceptionSignal) - 0.5),
  ];

  const confidenceBand = clamp01(
    uncertaintyComponents.reduce((sum, v) => sum + v, 0) / uncertaintyComponents.length * 1.8
  );

  return { posterior: raw, confidenceBand };
}
