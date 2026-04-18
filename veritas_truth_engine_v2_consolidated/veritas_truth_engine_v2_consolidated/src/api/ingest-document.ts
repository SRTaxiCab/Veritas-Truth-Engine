import { DocumentIngestionService } from "../lib/document-ingestion-service.js";
import { getEnterpriseRepository } from "../lib/enterprise-repository-factory.js";
import type { IngestDocumentRequest } from "../ingest/types.js";

const service = new DocumentIngestionService();

export async function ingestDocumentHandler(payload: IngestDocumentRequest) {
  const repo = getEnterpriseRepository();
  const result = service.ingest(payload);
  const stored = await repo.saveIngestion(result);
  return {
    ...result,
    tenantId: stored.tenantId,
    createdBy: stored.createdBy,
    createdAt: stored.createdAt,
  };
}

export async function ingestDocumentJobHandler(payload: IngestDocumentRequest) {
  const repo = getEnterpriseRepository();
  const job = await repo.createJob({
    type: "document_ingestion",
    title: `Ingest ${payload.title?.trim() || "Untitled Document"}`,
    payload: {
      title: payload.title,
      mimeType: payload.mimeType ?? "text/plain",
      publicImpact: Boolean(payload.publicImpact),
      hasBase64Content: Boolean(payload.base64Content),
      contentLength: payload.content?.length ?? payload.text?.length ?? payload.rawText?.length ?? payload.base64Content?.length ?? 0,
    },
  });

  await repo.updateJob(job.id, {
    status: "running",
    progress: 15,
    startedAt: new Date().toISOString(),
  });

  try {
    const result = service.ingest(payload);
    const stored = await repo.saveIngestion(result);
    const completed = await repo.updateJob(job.id, {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      result: {
        documentId: stored.document.id,
        title: stored.document.title,
        claimCount: stored.claimPackages.length,
        reviewCount: stored.reviewCount,
        contentHash: stored.document.contentHash,
      },
    });

    return {
      ok: true,
      job: completed,
      result: {
        ...result,
        tenantId: stored.tenantId,
        createdBy: stored.createdBy,
        createdAt: stored.createdAt,
      },
    };
  } catch (error) {
    const failed = await repo.updateJob(job.id, {
      status: "failed",
      progress: 100,
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown ingestion error",
    });
    return {
      ok: false,
      job: failed,
      error: error instanceof Error ? error.message : "Unknown ingestion error",
    };
  }
}

export async function listIngestionHistoryHandler() {
  const ingestions = await getEnterpriseRepository().listIngestions();
  return {
    ok: true,
    ingestions: ingestions.map((ingestion) => ({
      createdAt: ingestion.createdAt,
      document: ingestion.document,
      source: ingestion.source,
      sourceVersion: ingestion.sourceVersion,
      chunkCount: ingestion.chunks.length,
      claimCount: ingestion.claimPackages.length,
      reviewCount: ingestion.reviewCount,
      claimPackages: ingestion.claimPackages,
    })),
  };
}

export async function listJobsHandler() {
  return {
    ok: true,
    jobs: await getEnterpriseRepository().listJobs(),
  };
}

export async function getJobHandler(jobId: string) {
  const job = await getEnterpriseRepository().getJob(jobId);
  if (!job) {
    return { ok: false, error: "Job not found." };
  }
  return { ok: true, job };
}
