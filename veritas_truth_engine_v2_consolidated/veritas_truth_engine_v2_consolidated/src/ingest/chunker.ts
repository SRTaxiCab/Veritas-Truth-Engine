import crypto from "node:crypto";
import { DocumentChunk } from "./types.js";

export function hashText(text: string): string {
  return `sha256:${crypto.createHash("sha256").update(text).digest("hex")}`;
}

export function stableId(prefix: string, text: string): string {
  return `${prefix}_${crypto.createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
}

export function chunkText(contentText: string, targetSize = 1200, overlap = 120): DocumentChunk[] {
  const normalized = contentText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const chunks: DocumentChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    let end = Math.min(start + targetSize, normalized.length);

    if (end < normalized.length) {
      const breakpoints = [
        normalized.lastIndexOf("\n\n", end),
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf("\n", end),
      ];
      const breakpoint = Math.max(...breakpoints);
      if (breakpoint > start + Math.floor(targetSize * 0.5)) {
        end = breakpoint + 1;
      }
    }

    const text = normalized.slice(start, end).trim();
    if (text) {
      chunks.push({
        id: stableId("chk", `${index}:${start}:${text}`),
        chunkIndex: index,
        charStart: start,
        charEnd: end,
        text,
        contentHash: hashText(text),
      });
      index += 1;
    }

    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}
