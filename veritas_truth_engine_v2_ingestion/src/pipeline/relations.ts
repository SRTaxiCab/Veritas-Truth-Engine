import { ClaimRelation } from "../core/types";
import { Claim } from "../core/types";

function normalize(s?: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function deriveClaimRelations(claims: Claim[]): ClaimRelation[] {
  const relations: ClaimRelation[] = [];
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const a = claims[i];
      const b = claims[j];
      if (a.canonicalFingerprint === b.canonicalFingerprint) {
        relations.push({ fromClaimId: a.id, toClaimId: b.id, relationType: "duplicate", confidence: 0.98 });
        continue;
      }
      const samePred = normalize(a.predicate) === normalize(b.predicate);
      const sameObj = normalize(a.objectLiteral) && normalize(a.objectLiteral) === normalize(b.objectLiteral);
      const textOverlap = normalize(a.claimText) === normalize(b.claimText) || normalize(a.claimText).includes(normalize(b.claimText)) || normalize(b.claimText).includes(normalize(a.claimText));
      if (samePred && sameObj && a.polarity !== b.polarity) {
        relations.push({ fromClaimId: a.id, toClaimId: b.id, relationType: "contradicts", confidence: 0.82 });
      } else if ((samePred && sameObj) || textOverlap) {
        relations.push({ fromClaimId: a.id, toClaimId: b.id, relationType: "supports", confidence: 0.66 });
      }
    }
  }
  return relations;
}
