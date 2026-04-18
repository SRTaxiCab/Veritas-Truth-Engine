export interface OcrWord {
  text: string;
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface OcrLine {
  text: string;
  confidence: number;
  words?: OcrWord[];
  pageNumber?: number;
  lineNumber?: number;
}

export interface OcrPage {
  pageNumber: number;
  text: string;
  confidence: number;
  lines: OcrLine[];
  imageHash?: string;
}

export interface OcrDocument {
  documentId: string;
  sourceFileName?: string;
  engine: string;
  averageConfidence: number;
  pages: OcrPage[];
  normalizedText: string;
  warnings: string[];
}

export interface OcrRequest {
  documentId: string;
  mimeType: string;
  fileName?: string;
  extractedText?: string;
  pageImages?: string[];
}

export interface OcrAdapter {
  readonly name: string;
  extract(request: OcrRequest): Promise<OcrDocument>;
}
