import crypto from "node:crypto";
import type { Claim, EvidenceBundle, Source, SourceVersion, ClaimRelation } from "../core/types.js";

export interface IngestedDocumentRecord {
  documentId: string;
  source: Source;
  sourceVersion: SourceVersion;
}

export interface PersistedClaimPackage {
  claim: Claim;
  evidence: EvidenceBundle[];
}

export interface IngestionRepository {
  createDocumentRecord(input: {
    title: string;
    text: string;
    mimeType: string;
    sourceType?: string;
    origin?: string;
    author?: string;
    publishedAt?: string | null;
  }): Promise<IngestedDocumentRecord>;

  saveClaims(record: IngestedDocumentRecord, packages: PersistedClaimPackage[]): Promise<void>;
  saveRelations(relations: ClaimRelation[]): Promise<void>;
}

function hash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

export class InMemoryIngestionRepository implements IngestionRepository {
  public readonly documents: IngestedDocumentRecord[] = [];
  public readonly claims: PersistedClaimPackage[] = [];
  public readonly relations: ClaimRelation[] = [];

  async createDocumentRecord(input: {
    title: string;
    text: string;
    mimeType: string;
    sourceType?: string;
    origin?: string;
    author?: string;
    publishedAt?: string | null;
  }): Promise<IngestedDocumentRecord> {
    const source: Source = {
      id: `src_${hash(input.title).slice(0, 12)}`,
      title: input.title,
      sourceType: input.sourceType ?? "document",
      origin: input.origin ?? "ingestion_pipeline",
      author: input.author ?? null,
      publishedAt: input.publishedAt ?? null,
      acquiredAt: new Date().toISOString(),
      reliabilityPrior: 0.65,
      chainOfCustodyScore: 0.75,
      primarySource: false
    };

    const sourceVersion: SourceVersion = {
      id: `sv_${hash(input.title + input.text).slice(0, 12)}`,
      sourceId: source.id,
      versionNumber: 1,
      extractionMethod: "ingestion_v2",
      extractionConfidence: 0.80,
      contentHash: hash(input.text)
    };

    const record = { documentId: `doc_${hash(input.title + sourceVersion.contentHash).slice(0, 12)}`, source, sourceVersion };
    this.documents.push(record);
    return record;
  }

  async saveClaims(_record: IngestedDocumentRecord, packages: PersistedClaimPackage[]): Promise<void> {
    this.claims.push(...packages);
  }

  async saveRelations(relations: ClaimRelation[]): Promise<void> {
    this.relations.push(...relations);
  }
}
