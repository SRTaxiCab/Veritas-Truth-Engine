import type { EvaluateClaimInput, TruthAssessment, TruthState } from '../core/types.js';

export interface LabeledClaimExample {
  id: string;
  domain: 'history' | 'law' | 'journalism' | 'osint' | 'general';
  input: EvaluateClaimInput;
  expectedTruthState: TruthState;
  expectedMinScore?: number;
  expectedMaxScore?: number;
  notes?: string;
}

export interface BenchmarkCaseResult {
  exampleId: string;
  expectedTruthState: TruthState;
  predictedTruthState: TruthState;
  score: number;
  assessment: TruthAssessment;
  passedState: boolean;
  passedScoreBand: boolean;
}

export interface BenchmarkSummary {
  modelVersion: string;
  total: number;
  stateAccuracy: number;
  bandAccuracy: number;
  averageScore: number;
  byDomain: Record<string, { total: number; stateAccuracy: number; bandAccuracy: number }>;
  cases: BenchmarkCaseResult[];
}

export interface CalibrationPoint {
  bucketMin: number;
  bucketMax: number;
  count: number;
  empiricalSupportRate: number;
  predictedMean: number;
}

export interface CalibrationReport {
  ece: number;
  mce: number;
  brierScore: number;
  points: CalibrationPoint[];
}
