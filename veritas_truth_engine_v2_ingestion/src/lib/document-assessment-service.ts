import { evaluateClaim } from "../core/truth-engine-v2";
import { chunkText } from "../ingest/chunker";
import { parseDocumentBuffer, parseDocumentFromPath } from "../ingest/parsers";
import { SupportedDocumentType } from "../ingest/types";
import { candidateToClaim, extractClaimCandidatesFromChunk } from "../pipeline/claim-extractor";
import { deriveClaimRelations } from "../pipeline/relations";
import { PostgresIngestionRepository } from "./ingestion-repository";
import { PostgresTruthEngineRepository } from "./repository";

export interface AssessDocumentResult {
  ingestedDocumentId: string;
  extractionRunId: string;
  assessments: ReturnType<typeof evaluateClaim>[];
  reviewCount: number;
}

export class DocumentAssessmentService {
  constructor(
    private readonly ingestionRepo = new PostgresIngestionRepository(),
    private readonly truthRepo = new PostgresTruthEngineRepository()
  ) {}

  async assessTextDocument(title: string, content: string, mimeType: SupportedDocumentType = "text/plain"): Promise<AssessDocumentResult> {
    const parsed = await parseDocumentBuffer(Buffer.from(content, "utf8"), mimeType, title);
    return this.assessParsedDocument(parsed);
  }

  async assessDocumentPath(filePath: string, title?: string): Promise<AssessDocumentResult> {
    const parsed = await parseDocumentFromPath(filePath, title);
    return this.assessParsedDocument(parsed);
  }

  private async assessParsedDocument(parsed: Awaited<ReturnType<typeof parseDocumentFromPath>>): Promise<AssessDocumentResult> {
    const chunks = chunkText(parsed.contentText);
    const candidates = chunks.flatMap((chunk) => extractClaimCandidatesFromChunk(chunk));
    const claims = candidates.map(candidateToClaim);
    const relations = deriveClaimRelations(claims);
    const persisted = await this.ingestionRepo.persistIngestion(parsed, chunks, candidates, claims, relations);

    const assessments = [];
    let reviewCount = 0;

    for (let i = 0; i < persisted.claims.length; i += 1) {
      const claim = persisted.claims[i];
      const evidence = [persisted.evidence[i]];
      const related = relations.filter((r) => r.fromClaimId === claim.id || r.toClaimId === claim.id);
      const result = evaluateClaim({ claim, evidence, relatedClaimRelations: related, publicImpact: true });
      assessments.push(result);
      await this.truthRepo.saveAssessment(result);
      if (result.explanation.triggeredReview) {
        reviewCount += 1;
        await this.truthRepo.enqueueReview(claim.id, result, 'document_ingestion_review');
      }
    }

    return {
      ingestedDocumentId: persisted.ingestedDocumentId,
      extractionRunId: persisted.extractionRunId,
      assessments,
      reviewCount,
    };
  }
}
