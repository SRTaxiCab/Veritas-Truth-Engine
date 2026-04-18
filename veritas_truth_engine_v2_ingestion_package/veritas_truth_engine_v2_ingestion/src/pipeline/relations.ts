import type { ClaimRelation, Claim } from "../core/types.js";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export function deriveRelations(claims: Claim[]): ClaimRelation[] {
  const relations: ClaimRelation[] = [];

  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const a = claims[i];
      const b = claims[j];
      const na = normalize(a.claimText);
      const nb = normalize(b.claimText);

      if (a.canonicalFingerprint === b.canonicalFingerprint) {
        relations.push({
          fromClaimId: a.id,
          toClaimId: b.id,
          relationType: "duplicate",
          confidence: 0.98
        });
        continue;
      }

      const overlap = na.split(" ").filter((token) => nb.includes(token)).length;
      const overlapScore = overlap / Math.max(na.split(" ").length, 1);

      if (overlapScore >= 0.65 && a.polarity !== b.polarity) {
        relations.push({
          fromClaimId: a.id,
          toClaimId: b.id,
          relationType: "contradicts",
          confidence: Math.min(0.95, 0.45 + overlapScore)
        });
      } else if (overlapScore >= 0.65) {
        relations.push({
          fromClaimId: a.id,
          toClaimId: b.id,
          relationType: "supports",
          confidence: Math.min(0.92, 0.40 + overlapScore)
        });
      }
    }
  }

  return relations;
}
