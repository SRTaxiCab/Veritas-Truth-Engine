import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DocumentIngestionService } from "../lib/document-ingestion-service.js";
import { getEnterpriseRepository } from "../lib/enterprise-repository-factory.js";
import type { JobType } from "../lib/local-store.js";
import type { SupportedDocumentType } from "../ingest/types.js";

const SUPPORTED_FILE_TYPES: Record<string, SupportedDocumentType> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".json": "application/json",
  ".pdf": "application/pdf",
};

export interface BulkIngestionOptions {
  inputPath: string;
  recursive?: boolean;
  publicImpact?: boolean;
  archiveMode?: "keep" | "move";
  processedDir?: string;
  failedDir?: string;
}

export interface BulkIngestionItemResult {
  filePath: string;
  status: "completed" | "failed";
  jobId: string;
  documentId?: string;
  claimCount?: number;
  reviewCount?: number;
  error?: string;
}

export interface BulkIngestionSummary {
  rootPath: string;
  discoveredFiles: number;
  processedFiles: number;
  failedFiles: number;
  items: BulkIngestionItemResult[];
}

export interface BulkWatchOptions extends BulkIngestionOptions {
  pollMs?: number;
}

function mimeTypeForFile(filePath: string): SupportedDocumentType | null {
  return SUPPORTED_FILE_TYPES[path.extname(filePath).toLowerCase()] ?? null;
}

function supportedFile(filePath: string): boolean {
  return mimeTypeForFile(filePath) !== null;
}

function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function collectFiles(targetPath: string, recursive: boolean, ignoredRoots: string[]): string[] {
  if (!fs.existsSync(targetPath)) return [];
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) return supportedFile(targetPath) ? [targetPath] : [];
  if (!stats.isDirectory()) return [];

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (ignoredRoots.includes(entryPath)) continue;
    if (entry.isFile() && supportedFile(entryPath)) {
      files.push(entryPath);
      continue;
    }
    if (recursive && entry.isDirectory()) {
      files.push(...collectFiles(entryPath, true, ignoredRoots));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function archiveDestination(baseDir: string, filePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(baseDir, `${timestamp}-${path.basename(filePath)}`);
}

function moveFile(filePath: string, destinationDir: string): void {
  ensureDirectory(destinationDir);
  const destinationPath = archiveDestination(destinationDir, filePath);
  fs.renameSync(filePath, destinationPath);
}

async function processFile(
  filePath: string,
  options: Required<Pick<BulkIngestionOptions, "archiveMode" | "publicImpact">> &
    Pick<BulkIngestionOptions, "processedDir" | "failedDir">
): Promise<BulkIngestionItemResult> {
  const repo = getEnterpriseRepository();
  const service = new DocumentIngestionService();
  const mimeType = mimeTypeForFile(filePath);
  if (!mimeType) {
    throw new Error(`Unsupported file type for ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const job = await repo.createJob({
    type: "document_ingestion" as JobType,
    title: `Bulk ingest ${path.basename(filePath)}`,
    payload: {
      automation: true,
      filePath,
      fileSizeBytes: stats.size,
      mimeType,
      publicImpact: options.publicImpact,
    },
  });

  await repo.updateJob(job.id, {
    status: "running",
    progress: 10,
    startedAt: new Date().toISOString(),
  });

  try {
    const buffer = fs.readFileSync(filePath);
    await repo.updateJob(job.id, { progress: 35 });
    const result = service.ingestBuffer({
      title: path.basename(filePath),
      buffer,
      mimeType,
      publicImpact: options.publicImpact,
    });
    const stored = await repo.saveIngestion(result);
    await repo.updateJob(job.id, {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      result: {
        automation: true,
        documentId: stored.document.id,
        title: stored.document.title,
        claimCount: stored.claimPackages.length,
        reviewCount: stored.reviewCount,
        contentHash: stored.document.contentHash,
      },
    });

    if (options.archiveMode === "move" && options.processedDir) {
      moveFile(filePath, options.processedDir);
    }

    return {
      filePath,
      status: "completed",
      jobId: job.id,
      documentId: stored.document.id,
      claimCount: stored.claimPackages.length,
      reviewCount: stored.reviewCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bulk ingestion error";
    await repo.updateJob(job.id, {
      status: "failed",
      progress: 100,
      completedAt: new Date().toISOString(),
      error: message,
    });

    if (options.archiveMode === "move" && options.failedDir && fs.existsSync(filePath)) {
      moveFile(filePath, options.failedDir);
    }

    return {
      filePath,
      status: "failed",
      jobId: job.id,
      error: message,
    };
  }
}

export async function processBulkIngestion(options: BulkIngestionOptions): Promise<BulkIngestionSummary> {
  const rootPath = path.resolve(options.inputPath);
  const archiveMode = options.archiveMode ?? "keep";
  const recursive = options.recursive ?? true;
  const publicImpact = Boolean(options.publicImpact);
  const processedDir = options.processedDir ? path.resolve(options.processedDir) : path.join(rootPath, "_processed");
  const failedDir = options.failedDir ? path.resolve(options.failedDir) : path.join(rootPath, "_failed");

  ensureDirectory(rootPath);
  if (archiveMode === "move") {
    ensureDirectory(processedDir);
    ensureDirectory(failedDir);
  }

  const files = collectFiles(rootPath, recursive, [processedDir, failedDir]);
  const items: BulkIngestionItemResult[] = [];
  for (const filePath of files) {
    items.push(await processFile(filePath, { archiveMode, publicImpact, processedDir, failedDir }));
  }

  return {
    rootPath,
    discoveredFiles: files.length,
    processedFiles: items.filter((item) => item.status === "completed").length,
    failedFiles: items.filter((item) => item.status === "failed").length,
    items,
  };
}

export async function watchBulkIngestion(options: BulkWatchOptions): Promise<void> {
  const pollMs = Math.max(2_000, Math.floor(options.pollMs ?? 10_000));
  const rootPath = path.resolve(options.inputPath);
  ensureDirectory(rootPath);

  while (true) {
    const summary = await processBulkIngestion({
      ...options,
      inputPath: rootPath,
      archiveMode: "move",
    });

    if (summary.discoveredFiles > 0) {
      console.log(
        JSON.stringify({
          event: "bulk.ingestion.cycle",
          rootPath: summary.rootPath,
          discoveredFiles: summary.discoveredFiles,
          processedFiles: summary.processedFiles,
          failedFiles: summary.failedFiles,
        })
      );
    }

    await delay(pollMs);
  }
}
