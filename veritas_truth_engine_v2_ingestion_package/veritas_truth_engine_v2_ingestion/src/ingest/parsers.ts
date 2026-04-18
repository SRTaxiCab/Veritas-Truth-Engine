import fs from "node:fs";
import path from "node:path";

export interface ParsedDocument {
  text: string;
  mimeType: string;
  title: string;
  metadata: Record<string, unknown>;
}

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".txt": return "text/plain";
    case ".md": return "text/markdown";
    case ".json": return "application/json";
    case ".pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

export function parseDocumentFromFile(filePath: string): ParsedDocument {
  const mimeType = inferMimeType(filePath);
  const title = path.basename(filePath);

  if (mimeType === "application/pdf") {
    // Placeholder parser. In production, replace with pdfjs or a server-side extraction service.
    const buffer = fs.readFileSync(filePath);
    return {
      text: buffer.toString("latin1"),
      mimeType,
      title,
      metadata: { parser: "placeholder_pdf_parser", warning: "Raw bytes decoded as latin1. Replace with a real PDF parser." }
    };
  }

  if (mimeType === "application/json") {
    const raw = fs.readFileSync(filePath, "utf8");
    try {
      const parsed = JSON.parse(raw);
      return {
        text: JSON.stringify(parsed, null, 2),
        mimeType,
        title,
        metadata: { parser: "json_stringifier" }
      };
    } catch {
      return { text: raw, mimeType, title, metadata: { parser: "raw_json_fallback" } };
    }
  }

  return {
    text: fs.readFileSync(filePath, "utf8"),
    mimeType,
    title,
    metadata: { parser: "text_reader" }
  };
}

export function parseDocumentFromText(title: string, text: string, mimeType = "text/plain"): ParsedDocument {
  return {
    text,
    title,
    mimeType,
    metadata: { parser: "direct_text" }
  };
}
