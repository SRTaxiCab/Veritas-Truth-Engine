import type { CalibrationPoint, CalibrationReport } from './types.js';

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export interface ScoredOutcome {
  score: number;
  supported: 0 | 1;
}

export function buildCalibrationReport(outcomes: ScoredOutcome[], bucketCount = 10): CalibrationReport {
  const buckets: CalibrationPoint[] = [];
  let ece = 0;
  let mce = 0;
  let brierAccumulator = 0;

  for (let i = 0; i < bucketCount; i += 1) {
    const bucketMin = i / bucketCount;
    const bucketMax = (i + 1) / bucketCount;
    const members = outcomes.filter((o) => {
      if (i === bucketCount - 1) return o.score >= bucketMin && o.score <= bucketMax;
      return o.score >= bucketMin && o.score < bucketMax;
    });

    const count = members.length;
    const predictedMean = count ? members.reduce((s, m) => s + clamp01(m.score), 0) / count : 0;
    const empiricalSupportRate = count ? members.reduce((s, m) => s + m.supported, 0) / count : 0;

    const gap = Math.abs(predictedMean - empiricalSupportRate);
    if (count && outcomes.length) {
      ece += (count / outcomes.length) * gap;
      mce = Math.max(mce, gap);
    }

    buckets.push({ bucketMin, bucketMax, count, empiricalSupportRate, predictedMean });
  }

  for (const outcome of outcomes) {
    const error = clamp01(outcome.score) - outcome.supported;
    brierAccumulator += error * error;
  }

  return {
    ece,
    mce,
    brierScore: outcomes.length ? brierAccumulator / outcomes.length : 0,
    points: buckets,
  };
}
