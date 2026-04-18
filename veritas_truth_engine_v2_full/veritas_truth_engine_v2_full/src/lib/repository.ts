
import type { AssessmentResult, EvaluateClaimInput } from "../core/types.js";

export interface TruthEngineRepository {
  saveAssessment(input: EvaluateClaimInput, result: AssessmentResult): Promise<void>;
  enqueueReview(claimId: string, reasons: string[], priority?: "normal" | "high" | "critical"): Promise<void>;
}

export class InMemoryTruthEngineRepository implements TruthEngineRepository {
  public assessments: Array<{ input: EvaluateClaimInput; result: AssessmentResult }> = [];
  public reviewQueue: Array<{ claimId: string; reasons: string[]; priority: string }> = [];

  async saveAssessment(input: EvaluateClaimInput, result: AssessmentResult): Promise<void> {
    this.assessments.push({ input, result });
  }

  async enqueueReview(claimId: string, reasons: string[], priority: "normal" | "high" | "critical" = "normal"): Promise<void> {
    this.reviewQueue.push({ claimId, reasons, priority });
  }
}
