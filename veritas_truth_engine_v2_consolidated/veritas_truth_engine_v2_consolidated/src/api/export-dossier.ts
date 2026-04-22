import fs from "node:fs";
import path from "node:path";
import { buildEvidenceDossierDocument } from "../reports/dossier-builder.js";
import { exportEvidenceDossierAsPdf } from "../reports/pdf-export.js";
import { buildReportDocument } from "../reports/report-builder.js";
import { sampleClaimReportRecords } from "../examples/sample-report-records.js";
import { getEnterpriseRepository } from "../lib/enterprise-repository-factory.js";
import type { ClaimReportRecord } from "../reports/types.js";
import { HttpStatusError } from "./http-error.js";
import { evaluateExternalReleaseGate, type ReleaseGateDecision } from "./release-gates.js";

type ActiveRecords = {
  records: ClaimReportRecord[];
  demoMode: boolean;
};

async function activeRecords({ allowDemoRecords = true } = {}): Promise<ActiveRecords> {
  const liveRecords = await getEnterpriseRepository().latestReportRecords();
  if (liveRecords.length) return { records: liveRecords, demoMode: false };
  if (allowDemoRecords) return { records: sampleClaimReportRecords, demoMode: true };
  throw new HttpStatusError(409, "No live ingested records are available for export.", {
    remediation: "Ingest source material before exporting a dossier.",
  });
}

export interface ExportDossierRequest {
  allowRestrictedRelease?: boolean;
}

function assertDossierExportAllowed(records: ClaimReportRecord[], request: ExportDossierRequest): ReleaseGateDecision {
  const decision = evaluateExternalReleaseGate(records);
  if (decision.eligible || request.allowRestrictedRelease) return decision;

  throw new HttpStatusError(409, "Dossier export blocked by release gate.", {
    releaseGate: decision,
    remediation:
      "Resolve hold/review-required claims before external release, or submit allowRestrictedRelease=true for a restricted internal dossier.",
  });
}

export async function exportDossierHandler(request: ExportDossierRequest = {}): Promise<{
  pdfPath: string;
  htmlPath: string;
  releaseRecommendation: string;
  releaseGate: ReleaseGateDecision;
  restrictedOverride: boolean;
}> {
  const { records } = await activeRecords({ allowDemoRecords: false });
  const releaseGate = assertDossierExportAllowed(records, request);
  const metadata = {
    reportId: `dossier-${Date.now()}`,
    title: liveTitle(records),
    createdAt: new Date().toISOString(),
    generatedBy: "veritas_truth_engine_v2_consolidated",
    product: "Veritas Engine" as const,
    classification: "Internal Analytical Use",
    subject: liveSubject(records),
  };

  const dossier = buildEvidenceDossierDocument(metadata, records);
  await getEnterpriseRepository().audit("dossier.export", "dossier", metadata.reportId, `Exported dossier ${metadata.title}.`, {
    records: records.length,
    releaseRecommendation: dossier.releaseRecommendation,
    releaseGate,
    restrictedOverride: Boolean(request.allowRestrictedRelease && !releaseGate.eligible),
  });
  const outDir = path.resolve(process.cwd(), "artifacts");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, "veritas-evidence-dossier.pdf");
  const pdf = exportEvidenceDossierAsPdf(dossier, outputPath);

  return {
    pdfPath: pdf.outputPath,
    htmlPath: pdf.htmlPath,
    releaseRecommendation: dossier.releaseRecommendation,
    releaseGate,
    restrictedOverride: Boolean(request.allowRestrictedRelease && !releaseGate.eligible),
  };
}

export async function buildDossierPreview() {
  const { records, demoMode } = await activeRecords();
  return buildEvidenceDossierDocument(
    {
      reportId: `dossier-preview-${Date.now()}`,
      title: demoMode ? "Veritas Evidence Dossier Preview" : liveTitle(records),
      createdAt: new Date().toISOString(),
      generatedBy: "veritas_truth_engine_v2_consolidated",
      product: "Veritas Engine",
      classification: "Internal Analytical Use",
      subject: demoMode ? "Preview only. Not exportable without live ingested records." : liveSubject(records),
    },
    records
  );
}

function liveTitle(records: ClaimReportRecord[]): string {
  return records === sampleClaimReportRecords ? "Veritas Evidence Dossier Preview" : "Veritas Live Evidence Dossier";
}

function liveSubject(records: ClaimReportRecord[]): string {
  return records === sampleClaimReportRecords
    ? "Preview only"
    : `${records.length} claim(s) from local ingestion workspace`;
}
