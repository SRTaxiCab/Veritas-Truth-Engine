import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { hashText, stableId } from "./chunker.js";
import { IngestedTextDocument, SupportedDocumentType } from "./types.js";

const PARSER_VERSION = "1.0.0";

function normalizeText(text: string): string {
  return text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function extractPdfText(buffer: Buffer): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "veritas-pdf-"));
  const pdfPath = path.join(tempDir, "input.pdf");
  const scriptPath = path.join(tempDir, "extract_pdf.py");

  fs.writeFileSync(pdfPath, buffer);
  fs.writeFileSync(
    scriptPath,
    [
      "import sys",
      "from pypdf import PdfReader",
      "reader = PdfReader(sys.argv[1])",
      "for page in reader.pages:",
      "    print(page.extract_text() or '')",
    ].join("\n"),
    "utf8"
  );

  const pythonCommands = [process.env.PYTHON, "python", "py", "python3"].filter(Boolean) as string[];
  let result = spawnSync(pythonCommands[0]!, [scriptPath, pdfPath], { encoding: "utf8" });

  for (const command of pythonCommands.slice(1)) {
    const failedToStart = result.error || result.status === 9009 || /was not found|not recognized/i.test(result.stderr ?? "");
    if (!failedToStart) break;
    result = spawnSync(command, [scriptPath, pdfPath], { encoding: "utf8" });
  }

  fs.rmSync(tempDir, { recursive: true, force: true });

  if (result.status !== 0) {
    throw new Error(
      [
        "Failed to extract PDF text.",
        "Install pypdf for the active Python interpreter or paste extracted document text instead.",
        result.stdout?.trim() || "",
        result.stderr?.trim() || "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return normalizeText(result.stdout ?? "");
}

export function parseDocumentBuffer(
  buffer: Buffer,
  mimeType: SupportedDocumentType,
  title: string
): IngestedTextDocument {
  let contentText = "";
  let parserName = "native-text";

  if (mimeType === "application/pdf") {
    parserName = "python-pypdf";
    contentText = extractPdfText(buffer);
  } else {
    const raw = buffer.toString("utf8");
    if (mimeType === "application/json") {
      try {
        contentText = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        contentText = raw;
      }
    } else {
      contentText = raw;
    }
  }

  const normalized = normalizeText(contentText);

  return {
    id: stableId("doc", `${title}:${mimeType}:${normalized}`),
    title,
    mimeType,
    parserName,
    parserVersion: PARSER_VERSION,
    contentText: normalized,
    contentHash: hashText(normalized),
  };
}
