export type UUID = string;

export interface EntityAliasCandidate {
  raw: string;
  normalized: string;
  source?: string | null;
}

export interface CanonicalEntity {
  id: UUID;
  canonicalName: string;
  entityType: "person" | "organization" | "place" | "event" | "document" | "concept" | "unknown";
  normalizedName: string;
  aliases: string[];
  confidence: number;
  provenance: string[];
}

export interface EntityResolutionResult {
  entities: CanonicalEntity[];
  aliasToEntityId: Record<string, UUID>;
}
