import fs from "node:fs";
import path from "node:path";
import { buildEvidenceDossierDocument } from "../reports/dossier-builder.js";
import { exportEvidenceDossierAsPdf } from "../reports/pdf-export.js";
import { sampleClaimReportRecords } from "./sample-report-records.js";

async function main() {
  const dossier = buildEvidenceDossierDocument(
    {
      reportId: "veritas-dossier-demo",
      title: "Veritas Evidence Dossier Demo",
      createdAt: new Date().toISOString(),
      generatedBy: "dossier-demo",
      product: "Veritas Engine",
      classification: "Internal Analytical Use",
      subject: "Operation Lantern",
    },
    sampleClaimReportRecords
  );

  const outDir = path.resolve(process.cwd(), "artifacts");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, "veritas-evidence-dossier-demo.pdf");
  const result = exportEvidenceDossierAsPdf(dossier, outputPath);

  console.log(JSON.stringify({
    pdf: result.outputPath,
    html: result.htmlPath,
    releaseRecommendation: dossier.releaseRecommendation,
    chainOfCustodyNotes: dossier.chainOfCustodyNotes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
