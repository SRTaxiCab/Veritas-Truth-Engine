import { evaluateClaimV2 } from '../core/truth-engine-v2.js';
import type { BenchmarkCaseResult, BenchmarkSummary, LabeledClaimExample } from './types.js';

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function runBenchmark(examples: LabeledClaimExample[]): BenchmarkSummary {
  const cases: BenchmarkCaseResult[] = examples.map((example) => {
    const assessment = evaluateClaimV2(example.input);
    const passedState = assessment.truthState === example.expectedTruthState;
    const passedScoreBand =
      (example.expectedMinScore == null || assessment.posteriorTruthScore >= example.expectedMinScore) &&
      (example.expectedMaxScore == null || assessment.posteriorTruthScore <= example.expectedMaxScore);

    return {
      exampleId: example.id,
      expectedTruthState: example.expectedTruthState,
      predictedTruthState: assessment.truthState,
      score: assessment.posteriorTruthScore,
      assessment,
      passedState,
      passedScoreBand,
    };
  });

  const byDomainEntries = new Map<string, BenchmarkCaseResult[]>();
  examples.forEach((example, index) => {
    const existing = byDomainEntries.get(example.domain) ?? [];
    existing.push(cases[index]);
    byDomainEntries.set(example.domain, existing);
  });

  const byDomain = Object.fromEntries(
    [...byDomainEntries.entries()].map(([domain, domainCases]) => [
      domain,
      {
        total: domainCases.length,
        stateAccuracy: mean(domainCases.map((c) => (c.passedState ? 1 : 0))),
        bandAccuracy: mean(domainCases.map((c) => (c.passedScoreBand ? 1 : 0))),
      },
    ])
  );

  return {
    modelVersion: cases[0]?.assessment.modelVersion ?? 'unknown',
    total: cases.length,
    stateAccuracy: mean(cases.map((c) => (c.passedState ? 1 : 0))),
    bandAccuracy: mean(cases.map((c) => (c.passedScoreBand ? 1 : 0))),
    averageScore: mean(cases.map((c) => c.score)),
    byDomain,
    cases,
  };
}
