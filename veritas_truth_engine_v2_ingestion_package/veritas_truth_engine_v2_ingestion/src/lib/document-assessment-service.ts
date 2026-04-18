import type { TruthAssessment, Claim, EvaluateClaimInput } from "../core/types.js";
import { chunkText } from "../ingest/chunker.js";
import { parseDocumentFromFile, parseDocumentFromText } from "../ingest/parsers.js";
import { extractClaimsFromChunks } from "../pipeline/claim-extractor.js";
import { deriveRelations } from "../pipeline/relations.js";
import type { IngestionRepository } from "./ingestion-repository.js";
import { TruthEngineService } from "./service.js";

export interface DocumentAssessmentResult {
  documentId: string;
  claimCount: number;
  relationCount: number;
  assessments: TruthAssessment[];
}

export class DocumentAssessmentService {
  constructor(
    private readonly ingestionRepo: IngestionRepository,
    private readonly truthService: TruthEngineService
  ) {}

  async ingestAndAssessText(input: {
    title: string;
    text: string;
    mimeType?: string;
    sourceType?: string;
    origin?: string;
    author?: string;
    publishedAt?: string | null;
  }): Promise<DocumentAssessmentResult> {
    const parsed = parseDocumentFromText(input.title, input.text, input.mimeType);
    return this.processParsedDocument(parsed, input);
  }

  async ingestAndAssessFile(input: {
    filePath: string;
    sourceType?: string;
    origin?: string;
    author?: string;
    publishedAt?: string | null;
  }): Promise<DocumentAssessmentResult> {
    const parsed = parseDocumentFromFile(input.filePath);
    return this.processParsedDocument(parsed, input);
  }

  private async processParsedDocument(
    parsed: { title: string; text: string; mimeType: string },
    meta: { sourceType?: string; origin?: string; author?: string; publishedAt?: string | null }
  ): Promise<DocumentAssessmentResult> {
    const record = await this.ingestionRepo.createDocumentRecord({
      title: parsed.title,
      text: parsed.text,
      mimeType: parsed.mimeType,
      sourceType: meta.sourceType,
      origin: meta.origin,
      author: meta.author,
      publishedAt: meta.publishedAt
    });

    const chunks = chunkText(parsed.text);
    const packages = extractClaimsFromChunks(chunks, record.source, record.sourceVersion);
    await this.ingestionRepo.saveClaims(record, packages);

    const claims = packages.map((pkg) => pkg.claim);
    const relations = deriveRelations(claims);
    await this.ingestionRepo.saveRelations(relations);

    const assessments: TruthAssessment[] = [];
    for (const pkg of packages) {
      const claimRelations = relations.filter(
        (r) => r.fromClaimId === pkg.claim.id || r.toClaimId === pkg.claim.id
      );

      const evaluateInput: EvaluateClaimInput = {
        claim: pkg.claim,
        evidence: pkg.evidence,
        claimRelations,
        sourceLineage: [],
        causalLinks: [],
      };

      const assessment = await this.truthService.assessAndPersist(evaluateInput);
      assessments.push(assessment);
    }

    return {
      documentId: record.documentId,
      claimCount: claims.length,
      relationCount: relations.length,
      assessments
    };
  }
}
