
import { adjudicateClaimV2 } from "../core/truth-engine-v2.js";
import type { AssessmentResult, EvaluateClaimInput } from "../core/types.js";
import type { TruthEngineRepository } from "./repository.js";

export class TruthEngineService {
  constructor(private readonly repo: TruthEngineRepository) {}

  async assessAndPersist(input: EvaluateClaimInput): Promise<AssessmentResult> {
    const result = adjudicateClaimV2(input);
    await this.repo.saveAssessment(input, result);

    if (result.releaseDecision !== "auto_release") {
      const priority = result.releaseDecision === "hold" ? "critical" : "high";
      await this.repo.enqueueReview(result.claimId, result.reviewReasons, priority);
    }

    return result;
  }
}
