import type { Pool } from "pg";
import type { TruthAssessment, EvaluateClaimInput } from "../core/types.js";

export interface TruthEngineRepository {
  saveAssessment(input: EvaluateClaimInput, result: TruthAssessment): Promise<string | void>;
  enqueueReview(
    claimId: string,
    reasons: string[],
    priority?: "normal" | "high" | "critical",
    assessmentId?: string
  ): Promise<void>;
}

export class InMemoryTruthEngineRepository implements TruthEngineRepository {
  public assessments: Array<{ input: EvaluateClaimInput; result: TruthAssessment; assessmentId: string }> = [];
  public reviewQueue: Array<{ claimId: string; reasons: string[]; priority: string; assessmentId?: string }> = [];

  async saveAssessment(input: EvaluateClaimInput, result: TruthAssessment): Promise<string> {
    const assessmentId = `mem_${this.assessments.length + 1}`;
    this.assessments.push({ input, result, assessmentId });
    return assessmentId;
  }

  async enqueueReview(
    claimId: string,
    reasons: string[],
    priority: "normal" | "high" | "critical" = "normal",
    assessmentId?: string
  ): Promise<void> {
    this.reviewQueue.push({ claimId, reasons, priority, assessmentId });
  }
}

function num(n: number): string {
  return n.toFixed(4);
}

export class PostgresTruthEngineRepository implements TruthEngineRepository {
  constructor(private readonly pool: Pool) {}

  async saveAssessment(_input: EvaluateClaimInput, result: TruthAssessment): Promise<string> {
    const query = `
      insert into truth_assessments_v2 (
        claim_id,
        model_version,
        posterior_truth_score,
        confidence_band,
        truth_state,
        release_state,
        evidence_support,
        source_reliability,
        provenance_integrity,
        independence_adjusted_corroboration,
        temporal_coherence,
        causal_coherence,
        contradiction_pressure,
        revision_stability,
        deception_signal,
        explanation
      )
      values (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb
      )
      returning id
    `;

    const values = [
      result.claimId,
      result.modelVersion,
      num(result.posteriorTruthScore),
      num(result.confidenceBand),
      result.truthState,
      result.releaseState,
      num(result.features.evidenceSupport),
      num(result.features.sourceReliability),
      num(result.features.provenanceIntegrity),
      num(result.features.independenceAdjustedCorroboration),
      num(result.features.temporalCoherence),
      num(result.features.causalCoherence),
      num(result.features.contradictionPressure),
      num(result.features.revisionStability),
      num(result.features.deceptionSignal),
      JSON.stringify(result.explanation),
    ];

    const res = await this.pool.query<{ id: string }>(query, values);
    return res.rows[0].id;
  }

  async enqueueReview(
    claimId: string,
    reasons: string[],
    priority: "normal" | "high" | "critical" = "normal",
    assessmentId?: string
  ): Promise<void> {
    if (!reasons.length) return;

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      for (const reason of reasons) {
        await client.query(
          `
            insert into review_queue (
              claim_id,
              assessment_id,
              reason,
              priority,
              status
            ) values ($1,$2,$3,$4,'open')
          `,
          [claimId, assessmentId ?? null, reason, priority]
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
