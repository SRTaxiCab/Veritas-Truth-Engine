import type { Claim, ClaimRelation } from "../core/types.js";

function normalizedTerms(claim: Claim): Set<string> {
  return new Set(
    [claim.subject, claim.predicate, claim.object, claim.claimText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function deriveClaimRelations(claims: Claim[]): ClaimRelation[] {
  const relations: ClaimRelation[] = [];

  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const left = claims[i]!;
      const right = claims[j]!;
      const similarity = jaccard(normalizedTerms(left), normalizedTerms(right));
      if (similarity < 0.18) continue;

      const contradiction =
        left.polarity !== right.polarity ||
        /\b(not|denied|never|without)\b/i.test(left.claimText + " " + right.claimText);

      relations.push({
        fromClaimId: left.id,
        toClaimId: right.id,
        relationType: contradiction ? "contradicts" : similarity > 0.55 ? "duplicate" : "supports",
        confidence: Math.max(0.35, Math.min(0.92, similarity + (contradiction ? 0.25 : 0.15))),
      });
    }
  }

  return relations;
}
