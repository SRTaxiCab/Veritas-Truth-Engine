import { evaluateClaimV2 } from "../core/truth-engine-v2.js";
import type { TruthAssessment, EvaluateClaimInput } from "../core/types.js";
import type { TruthEngineRepository } from "./repository.js";

export class TruthEngineService {
  constructor(private readonly repo: TruthEngineRepository) {}

  async assessAndPersist(input: EvaluateClaimInput): Promise<TruthAssessment> {
    const result = evaluateClaimV2(input);
    const assessmentId = await this.repo.saveAssessment(input, result);

    if (result.releaseState !== "auto_release") {
      const priority = result.releaseState === "hold" ? "critical" : "high";
      await this.repo.enqueueReview(
        result.claimId,
        result.explanation.reviewReasons,
        priority,
        typeof assessmentId === "string" ? assessmentId : undefined
      );
    }

    return result;
  }
}
