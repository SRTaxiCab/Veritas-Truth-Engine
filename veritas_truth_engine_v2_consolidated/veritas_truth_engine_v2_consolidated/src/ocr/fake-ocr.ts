import type { OcrAdapter, OcrDocument, OcrPage, OcrRequest } from './types.js';
import { estimateLineConfidence, normalizeOcrText } from './ocr-adapter.js';

function splitIntoPages(text: string): string[] {
  const explicitPages = text.split(/\n\s*---PAGE BREAK---\s*\n/g);
  if (explicitPages.length > 1) return explicitPages;

  const paragraphs = text.split(/\n\n+/g);
  const pages: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).length > 1800 && current) {
      pages.push(current.trim());
      current = paragraph;
    } else {
      current += (current ? '\n\n' : '') + paragraph;
    }
  }
  if (current.trim()) pages.push(current.trim());
  return pages.length ? pages : [text];
}

export class HeuristicOcrAdapter implements OcrAdapter {
  readonly name = 'heuristic-ocr-v2';

  async extract(request: OcrRequest): Promise<OcrDocument> {
    const normalized = normalizeOcrText(request.extractedText ?? '');
    const rawPages = splitIntoPages(normalized);
    const warnings: string[] = [];

    const pages: OcrPage[] = rawPages.map((pageText, pageIndex) => {
      const lines = pageText.split('\n').map((line, idx) => ({
        text: line,
        confidence: estimateLineConfidence(line),
        pageNumber: pageIndex + 1,
        lineNumber: idx + 1,
      }));

      const averageConfidence = lines.length
        ? lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length
        : 0;

      if (averageConfidence < 0.65) {
        warnings.push(`Page ${pageIndex + 1} OCR confidence is weak (${averageConfidence.toFixed(2)}).`);
      }

      return {
        pageNumber: pageIndex + 1,
        text: pageText,
        confidence: averageConfidence,
        lines,
      };
    });

    const averageConfidence = pages.length
      ? pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length
      : 0;

    return {
      documentId: request.documentId,
      sourceFileName: request.fileName,
      engine: this.name,
      averageConfidence,
      pages,
      normalizedText: pages.map((p) => p.text).join('\n\n'),
      warnings,
    };
  }
}
