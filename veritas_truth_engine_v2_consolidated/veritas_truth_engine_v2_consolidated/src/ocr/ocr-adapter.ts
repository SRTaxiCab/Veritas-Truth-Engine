import type { OcrAdapter, OcrDocument, OcrLine, OcrPage, OcrRequest } from './types.js';

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function estimateLineConfidence(line: string): number {
  let score = 0.92;
  if (/[^\x09\x0A\x0D\x20-\x7E]/.test(line)) score -= 0.08;
  if (/\b[Il1|]{4,}\b/.test(line)) score -= 0.14;
  if (/\b(?:rn|vv|cl)\b/.test(line)) score -= 0.06;
  if (/\s{2,}/.test(line)) score -= 0.04;
  if (line.length < 4) score -= 0.05;
  return clamp01(score);
}

export function textToSinglePageDocument(request: OcrRequest, engine = 'text-normalizer-v1'): OcrDocument {
  const normalized = normalizeOcrText(request.extractedText ?? '');
  const lines: OcrLine[] = normalized.split('\n').map((text, idx) => ({
    text,
    confidence: estimateLineConfidence(text),
    pageNumber: 1,
    lineNumber: idx + 1,
  }));

  const page: OcrPage = {
    pageNumber: 1,
    text: normalized,
    confidence: lines.length ? lines.reduce((s, l) => s + l.confidence, 0) / lines.length : 0,
    lines,
  };

  return {
    documentId: request.documentId,
    sourceFileName: request.fileName,
    engine,
    averageConfidence: page.confidence,
    pages: [page],
    normalizedText: normalized,
    warnings: normalized ? [] : ['No extracted text was supplied to the OCR adapter.'],
  };
}

export class PassThroughOcrAdapter implements OcrAdapter {
  readonly name = 'pass-through-ocr-v1';

  async extract(request: OcrRequest): Promise<OcrDocument> {
    return textToSinglePageDocument(request, this.name);
  }
}
