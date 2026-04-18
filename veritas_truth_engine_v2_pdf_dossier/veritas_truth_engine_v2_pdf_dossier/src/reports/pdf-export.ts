import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EvidenceDossierDocument } from "./dossier-builder";
import { exportReportAsHtml } from "./html-export";

export interface PdfExportResult {
  outputPath: string;
  htmlPath: string;
  renderer: "python-reportlab";
}

export function exportEvidenceDossierAsPdf(
  dossier: EvidenceDossierDocument,
  outputPath: string
): PdfExportResult {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "veritas-dossier-"));
  const inputJsonPath = path.join(tempDir, "dossier.json");
  const htmlPath = path.join(tempDir, "dossier.html");

  fs.writeFileSync(inputJsonPath, JSON.stringify(dossier, null, 2), "utf8");
  fs.writeFileSync(htmlPath, exportReportAsHtml(dossier), "utf8");

  const scriptPath = path.resolve(process.cwd(), "scripts", "render_dossier_pdf.py");
  const result = spawnSync("python3", [scriptPath, inputJsonPath, outputPath], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error([
      "Failed to render dossier PDF.",
      result.stdout?.trim() || "",
      result.stderr?.trim() || "",
    ].filter(Boolean).join("\n"));
  }

  return {
    outputPath,
    htmlPath,
    renderer: "python-reportlab",
  };
}
