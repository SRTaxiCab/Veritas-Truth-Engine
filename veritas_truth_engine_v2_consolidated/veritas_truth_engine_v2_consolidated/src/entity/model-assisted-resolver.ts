import { CanonicalEntity, CanonicalizationCandidate, EntityMention } from "./types.js";
import { jaccardSimilarity, normalizeEntityText } from "./normalizer.js";

export interface ResolutionDecision {
  mention: EntityMention;
  matchedEntityId?: string;
  candidateScores: CanonicalizationCandidate[];
  confidence: number;
  decision: "matched" | "new_entity" | "needs_review";
  rationale: string[];
}

export interface ModelAssistedResolverOptions {
  autoMatchThreshold?: number;
  reviewThreshold?: number;
  maxCandidates?: number;
}

const DEFAULTS: Required<ModelAssistedResolverOptions> = {
  autoMatchThreshold: 0.92,
  reviewThreshold: 0.70,
  maxCandidates: 5,
};

export function resolveMentionWithHeuristics(
  mention: EntityMention,
  canonicalEntities: CanonicalEntity[],
  options?: ModelAssistedResolverOptions
): ResolutionDecision {
  const cfg = { ...DEFAULTS, ...(options ?? {}) };
  const normalized = normalizeEntityText(mention.text);

  const candidates: CanonicalizationCandidate[] = canonicalEntities
    .map((entity) => {
      const names = [entity.canonicalName, entity.normalizedName, ...entity.aliases];
      const score = Math.max(...names.map((name) => jaccardSimilarity(normalized, normalizeEntityText(name))));
      return {
        entityId: entity.id,
        entityName: entity.canonicalName,
        score,
        reasons: score > 0.95
          ? ["exact_or_near_exact_normalized_match"]
          : score > 0.80
          ? ["strong_alias_similarity"]
          : ["weak_similarity"],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxCandidates);

  const top = candidates[0];
  if (!top) {
    return {
      mention,
      candidateScores: [],
      confidence: 0.0,
      decision: "new_entity",
      rationale: ["no_existing_candidates_found"],
    };
  }

  if (top.score >= cfg.autoMatchThreshold) {
    return {
      mention,
      matchedEntityId: top.entityId,
      candidateScores: candidates,
      confidence: top.score,
      decision: "matched",
      rationale: ["candidate_exceeds_auto_match_threshold", ...top.reasons],
    };
  }

  if (top.score >= cfg.reviewThreshold) {
    return {
      mention,
      matchedEntityId: top.entityId,
      candidateScores: candidates,
      confidence: top.score,
      decision: "needs_review",
      rationale: ["candidate_requires_human_review", ...top.reasons],
    };
  }

  return {
    mention,
    candidateScores: candidates,
    confidence: top.score,
    decision: "new_entity",
    rationale: ["top_candidate_below_review_threshold"],
  };
}
