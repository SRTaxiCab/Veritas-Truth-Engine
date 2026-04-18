import { InMemoryTruthEngineRepository, PostgresTruthEngineRepository } from "../lib/repository.js";
import { InMemoryIngestionRepository } from "../lib/ingestion-repository.js";
import { TruthEngineService } from "../lib/service.js";
import { DocumentAssessmentService } from "../lib/document-assessment-service.js";
import { getPgPool } from "../lib/db.js";

export interface IngestDocumentRequest {
  title?: string;
  text?: string;
  filePath?: string;
  mimeType?: string;
  sourceType?: string;
  origin?: string;
  author?: string;
  publishedAt?: string | null;
}

export async function ingestDocumentHandler(body: IngestDocumentRequest) {
  const assessmentRepo = process.env.DATABASE_URL
    ? new PostgresTruthEngineRepository(getPgPool())
    : new InMemoryTruthEngineRepository();

  const ingestionRepo = new InMemoryIngestionRepository();
  const truthService = new TruthEngineService(assessmentRepo);
  const documentService = new DocumentAssessmentService(ingestionRepo, truthService);

  if (body.filePath) {
    return documentService.ingestAndAssessFile({
      filePath: body.filePath,
      sourceType: body.sourceType,
      origin: body.origin,
      author: body.author,
      publishedAt: body.publishedAt ?? null
    });
  }

  if (!body.text || !body.title) {
    throw new Error("Provide either { filePath } or both { title, text }.");
  }

  return documentService.ingestAndAssessText({
    title: body.title,
    text: body.text,
    mimeType: body.mimeType,
    sourceType: body.sourceType,
    origin: body.origin,
    author: body.author,
    publishedAt: body.publishedAt ?? null
  });
}
