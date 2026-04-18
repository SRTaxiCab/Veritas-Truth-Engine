export interface TextChunk {
  id: string;
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
}

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

export function chunkText(text: string, options?: ChunkOptions): TextChunk[] {
  const maxChars = options?.maxChars ?? 1600;
  const overlapChars = options?.overlapChars ?? 180;

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    if (end < text.length) {
      const nextBreak = Math.max(
        text.lastIndexOf("\n\n", end),
        text.lastIndexOf(". ", end),
        text.lastIndexOf("\n", end)
      );
      if (nextBreak > start + Math.floor(maxChars * 0.5)) {
        end = nextBreak + 1;
      }
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        id: `chunk_${index + 1}`,
        index,
        text: chunkText,
        charStart: start,
        charEnd: end
      });
      index += 1;
    }

    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}
