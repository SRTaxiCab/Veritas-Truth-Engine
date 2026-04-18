import fs from "node:fs";
import path from "node:path";
import { buildEvidenceDossierDocument } from "../reports/dossier-builder";
import { exportEvidenceDossierAsPdf } from "../reports/pdf-export";
import { buildReportDocument } from "../reports/report-builder";
import { sampleClaimReportRecords } from "../examples/sample-report-records";

export async function exportDossierHandler(): Promise<{
  pdfPath: string;
  htmlPath: string;
  releaseRecommendation: string;
}> {
  const metadata = {
    reportId: "dossier-demo-001",
    title: "ChronoScope Evidence Dossier",
    createdAt: new Date().toISOString(),
    generatedBy: "veritas_truth_engine_v2_pdf_dossier",
    product: "ChronoScope" as const,
    classification: "Internal Analytical Use",
    subject: "Demonstration provenance packet",
  };

  const dossier = buildEvidenceDossierDocument(metadata, sampleClaimReportRecords);
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

export function buildDossierPreview() {
  return buildEvidenceDossierDocument(
    {
      reportId: "dossier-preview-001",
      title: "ChronoScope Evidence Dossier Preview",
      createdAt: new Date().toISOString(),
      generatedBy: "veritas_truth_engine_v2_pdf_dossier",
      product: "ChronoScope",
      classification: "Internal Analytical Use",
      subject: "Preview only",
    },
    sampleClaimReportRecords
  );
}
