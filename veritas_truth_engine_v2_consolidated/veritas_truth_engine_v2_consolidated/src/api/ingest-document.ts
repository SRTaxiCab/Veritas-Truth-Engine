import { DocumentIngestionService } from "../lib/document-ingestion-service.js";
import { getEnterpriseRepository } from "../lib/enterprise-repository-factory.js";
import type { IngestDocumentRequest } from "../ingest/types.js";
import { HttpStatusError } from "./http-error.js";

const service = new DocumentIngestionService();

export interface IngestionHistoryQuery {
  q?: string;
  releaseState?: "auto_release" | "review_required" | "hold" | "any";
  mimeType?: string;
  publicImpact?: boolean;
  limit?: number;
}

export interface JobHistoryQuery {
  q?: string;
  status?: "queued" | "running" | "completed" | "failed" | "cancelled" | "any";
  type?: "document_ingestion" | "report_export" | "dossier_export" | "ocr_extraction" | "any";
  limit?: number;
}

function normalizeSearch(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function clampLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value!)));
}

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
  return listIngestionHistoryWithQuery({});
}

export async function listIngestionHistoryWithQuery(query: IngestionHistoryQuery) {
  const ingestions = await getEnterpriseRepository().listIngestions();
  const search = normalizeSearch(query.q);
  const limit = clampLimit(query.limit, 50, 250);
  const filtered = ingestions.filter((ingestion) => {
    if (query.mimeType && query.mimeType !== "any" && ingestion.document.mimeType !== query.mimeType) {
      return false;
    }

    if (typeof query.publicImpact === "boolean") {
      const hasPublicImpact = ingestion.claimPackages.some((item) => Boolean(item.claim.publicImpact));
      if (hasPublicImpact !== query.publicImpact) return false;
    }

    if (query.releaseState && query.releaseState !== "any") {
      const hasReleaseState = ingestion.claimPackages.some((item) => item.assessment.releaseState === query.releaseState);
      if (!hasReleaseState) return false;
    }

    if (!search) return true;

    const haystack = [
      ingestion.document.id,
      ingestion.document.title,
      ingestion.document.mimeType,
      ingestion.document.contentText,
      ingestion.source.title,
      ...ingestion.claimPackages.flatMap((item) => [
        item.claim.claimText,
        item.claim.subject ?? "",
        item.claim.predicate,
        item.claim.object ?? "",
        item.assessment.truthState,
        item.assessment.releaseState,
        item.candidate.sentence,
      ]),
    ]
      .join("\n")
      .toLowerCase();

    return haystack.includes(search);
  });

  return {
    ok: true,
    total: ingestions.length,
    count: Math.min(filtered.length, limit),
    filters: {
      q: query.q ?? "",
      releaseState: query.releaseState ?? "any",
      mimeType: query.mimeType ?? "any",
      publicImpact: typeof query.publicImpact === "boolean" ? query.publicImpact : null,
      limit,
    },
    ingestions: filtered.slice(0, limit).map((ingestion) => ({
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

export async function getIngestionHandler(documentId: string) {
  const ingestions = await getEnterpriseRepository().listIngestions();
  const ingestion = ingestions.find((item) => item.document.id === documentId);
  if (!ingestion) {
    throw new HttpStatusError(404, "Ingestion not found.", {
      remediation: "Refresh ingestion history and choose a document that exists in the active tenant.",
    });
  }

  return {
    ok: true,
    ingestion: {
      createdAt: ingestion.createdAt,
      tenantId: ingestion.tenantId,
      createdBy: ingestion.createdBy,
      document: ingestion.document,
      source: ingestion.source,
      sourceVersion: ingestion.sourceVersion,
      chunks: ingestion.chunks,
      candidates: ingestion.candidates,
      relations: ingestion.relations,
      claimCount: ingestion.claimPackages.length,
      reviewCount: ingestion.reviewCount,
      claimPackages: ingestion.claimPackages,
    },
  };
}

export async function listJobsHandler() {
  return listJobsWithQuery({});
}

export async function listJobsWithQuery(query: JobHistoryQuery) {
  const jobs = await getEnterpriseRepository().listJobs();
  const search = normalizeSearch(query.q);
  const limit = clampLimit(query.limit, 25, 250);
  const filtered = jobs.filter((job) => {
    if (query.status && query.status !== "any" && job.status !== query.status) return false;
    if (query.type && query.type !== "any" && job.type !== query.type) return false;
    if (!search) return true;

    const haystack = [
      job.id,
      job.title,
      job.type,
      job.status,
      JSON.stringify(job.payload ?? {}),
      JSON.stringify(job.result ?? {}),
      job.error ?? "",
    ]
      .join("\n")
      .toLowerCase();

    return haystack.includes(search);
  });

  return {
    ok: true,
    total: jobs.length,
    count: Math.min(filtered.length, limit),
    filters: {
      q: query.q ?? "",
      status: query.status ?? "any",
      type: query.type ?? "any",
      limit,
    },
    jobs: filtered.slice(0, limit),
  };
}

export async function getJobHandler(jobId: string) {
  const job = await getEnterpriseRepository().getJob(jobId);
  if (!job) {
    return { ok: false, error: "Job not found." };
  }
  return { ok: true, job };
}
