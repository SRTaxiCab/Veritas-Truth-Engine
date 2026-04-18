import type { Claim } from "../core/types.js";
import type { CanonicalEntity, EntityResolutionResult } from "./types.js";
import { canonicalDisplayName, jaccardSimilarity, normalizeEntityText } from "./normalizer.js";

function inferEntityType(value: string): CanonicalEntity["entityType"] {
  const v = value.toLowerCase();
  if (/\bcommittee\b|\bagency\b|\bdepartment\b|\boffice\b|\bcompany\b|\bgroup\b/.test(v)) return "organization";
  if (/\barchive\b|\brecord\b|\bmemo\b|\bstatement\b|\breport\b/.test(v)) return "document";
  if (/\bcity\b|\bstate\b|\bcountry\b|\bcounty\b|\barchive\b/.test(v)) return "place";
  return "unknown";
}

export function resolveEntitiesFromClaims(claims: Claim[]): EntityResolutionResult {
  const entities: CanonicalEntity[] = [];
  const aliasToEntityId: Record<string, string> = {};

  function upsert(rawValue: string | null | undefined, provenance: string): string | null {
    if (!rawValue) return null;
    const normalized = normalizeEntityText(rawValue);
    if (!normalized) return null;

    const existing = entities.find((entity) =>
      entity.normalizedName === normalized || jaccardSimilarity(entity.normalizedName, normalized) >= 0.9
    );

    if (existing) {
      if (!existing.aliases.includes(rawValue)) existing.aliases.push(rawValue);
      if (!existing.provenance.includes(provenance)) existing.provenance.push(provenance);
      aliasToEntityId[rawValue] = existing.id;
      aliasToEntityId[normalized] = existing.id;
      return existing.id;
    }

    const id = `ent_${entities.length + 1}`;
    const entity: CanonicalEntity = {
      id,
      canonicalName: canonicalDisplayName(rawValue),
      entityType: inferEntityType(rawValue),
      normalizedName: normalized,
      aliases: [rawValue],
      confidence: 0.8,
      provenance: [provenance]
    };
    entities.push(entity);
    aliasToEntityId[rawValue] = id;
    aliasToEntityId[normalized] = id;
    return id;
  }

  for (const claim of claims) {
    upsert(claim.subject, claim.id);
    upsert(claim.object, claim.id);
    upsert(claim.location, claim.id);
  }

  return { entities, aliasToEntityId };
}
