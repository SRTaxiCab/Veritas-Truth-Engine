import { benchmarkExamples } from '../bench/datasets.js';
import { runBenchmark } from '../bench/metrics.js';
import { buildCalibrationReport } from '../bench/calibration.js';

const summary = runBenchmark(benchmarkExamples);
console.log('=== Benchmark Summary ===');
console.log(JSON.stringify(summary, null, 2));

const outcomes = summary.cases.map((c) => ({
  score: c.assessment.posteriorTruthScore,
  supported: (c.expectedTruthState === 'strongly_supported' || c.expectedTruthState === 'supported') ? 1 as const : 0 as const,
}));

const calibration = buildCalibrationReport(outcomes, 5);
console.log('\n=== Calibration Report ===');
console.log(JSON.stringify(calibration, null, 2));
