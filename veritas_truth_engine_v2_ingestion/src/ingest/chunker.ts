import crypto from "crypto";
import { DocumentChunk } from "./types";

export function chunkText(contentText: string, targetSize = 1200, overlap = 120): DocumentChunk[] {
  const normalized = contentText.replace(/
/g, "
").trim();
  if (!normalized) return [];
  const chunks: DocumentChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    let end = Math.min(start + targetSize, normalized.length);
    if (end < normalized.length) {
      const breakpoint = Math.max(
        normalized.lastIndexOf("

", end),
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf("
", end)
      );
      if (breakpoint > start + Math.floor(targetSize * 0.5)) {
        end = breakpoint + 1;
      }
    }
    const text = normalized.slice(start, end).trim();
    chunks.push({
      chunkIndex: index++,
      charStart: start,
      charEnd: end,
      text,
    });
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, end);
  }

  return chunks;
}

export function hashChunk(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}
