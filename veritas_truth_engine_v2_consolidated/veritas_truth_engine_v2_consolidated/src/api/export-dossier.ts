import fs from "node:fs";
import path from "node:path";
import { buildEvidenceDossierDocument } from "../reports/dossier-builder.js";
import { exportEvidenceDossierAsPdf } from "../reports/pdf-export.js";
import { buildReportDocument } from "../reports/report-builder.js";
import { sampleClaimReportRecords } from "../examples/sample-report-records.js";
import { getEnterpriseRepository } from "../lib/enterprise-repository-factory.js";
import type { ClaimReportRecord } from "../reports/types.js";

async function activeRecords(): Promise<ClaimReportRecord[]> {
  const liveRecords = await getEnterpriseRepository().latestReportRecords();
  return liveRecords.length ? liveRecords : sampleClaimReportRecords;
}

export async function exportDossierHandler(): Promise<{
  pdfPath: string;
  htmlPath: string;
  releaseRecommendation: string;
}> {
  const records = await activeRecords();
  const metadata = {
    reportId: `dossier-${Date.now()}`,
    title: liveTitle(records),
    createdAt: new Date().toISOString(),
    generatedBy: "veritas_truth_engine_v2_consolidated",
    product: "ChronoScope" as const,
    classification: "Internal Analytical Use",
    subject: liveSubject(records),
  };

  const dossier = buildEvidenceDossierDocument(metadata, records);
  await getEnterpriseRepository().audit("dossier.export", "dossier", metadata.reportId, `Exported dossier ${metadata.title}.`, {
    records: records.length,
    releaseRecommendation: dossier.releaseRecommendation,
  });
  const outDir = path.resolve(process.cwd(), "artifacts");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, "chronoscope-evidence-dossier.pdf");
  const pdf = exportEvidenceDossierAsPdf(dossier, outputPath);

  return {
    pdfPath: pdf.outputPath,
    htmlPath: pdf.htmlPath,
    releaseRecommendation: dossier.releaseRecommendation,
  };
}

export async function buildDossierPreview() {
  const records = await activeRecords();
  return buildEvidenceDossierDocument(
    {
      reportId: `dossier-preview-${Date.now()}`,
      title: liveTitle(records),
      createdAt: new Date().toISOString(),
      generatedBy: "veritas_truth_engine_v2_consolidated",
      product: "ChronoScope",
      classification: "Internal Analytical Use",
      subject: liveSubject(records),
    },
    records
  );
}

function liveTitle(records: ClaimReportRecord[]): string {
  return records === sampleClaimReportRecords ? "ChronoScope Evidence Dossier Preview" : "ChronoScope Live Evidence Dossier";
}

function liveSubject(records: ClaimReportRecord[]): string {
  return records === sampleClaimReportRecords
    ? "Preview only"
    : `${records.length} claim(s) from local ingestion workspace`;
}
