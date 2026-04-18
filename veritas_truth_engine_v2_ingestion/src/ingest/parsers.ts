import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { IngestedTextDocument, SupportedDocumentType } from "./types";

const PARSER_VERSION = "1.0.0";

function inferMimeType(filePath: string): SupportedDocumentType {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md") return "text/markdown";
  if (ext === ".json") return "application/json";
  if (ext === ".pdf") return "application/pdf";
  return "text/plain";
}

export async function parseDocumentFromPath(filePath: string, title?: string): Promise<IngestedTextDocument> {
  const mimeType = inferMimeType(filePath);
  const buffer = fs.readFileSync(filePath);
  return parseDocumentBuffer(buffer, mimeType, title ?? path.basename(filePath));
}

export async function parseDocumentBuffer(buffer: Buffer, mimeType: SupportedDocumentType, title: string): Promise<IngestedTextDocument> {
  if (mimeType === "application/pdf") {
    const parsed = await pdfParse(buffer);
    return {
      title,
      mimeType,
      parserName: "pdf-parse",
      parserVersion: PARSER_VERSION,
      contentText: parsed.text || "",
    };
  }

  const raw = buffer.toString("utf8");
  let contentText = raw;
  if (mimeType === "application/json") {
    try {
      const obj = JSON.parse(raw);
      contentText = JSON.stringify(obj, null, 2);
    } catch {
      contentText = raw;
    }
  }

  return {
    title,
    mimeType,
    parserName: "native-text",
    parserVersion: PARSER_VERSION,
    contentText,
  };
}
