import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EvidenceDossierDocument } from "./dossier-builder.js";
import { exportReportAsHtml } from "./html-export.js";

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
  const pythonCommands = [process.env.PYTHON, "python3", "python", "py"].filter(Boolean) as string[];
  let result = spawnSync(pythonCommands[0]!, [scriptPath, inputJsonPath, outputPath], { encoding: "utf8" });

  for (const command of pythonCommands.slice(1)) {
    const failedToStart = result.error || result.status === 9009 || /was not found|not recognized/i.test(result.stderr ?? "");
    if (!failedToStart) break;
    result = spawnSync(command, [scriptPath, inputJsonPath, outputPath], { encoding: "utf8" });
  }

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
