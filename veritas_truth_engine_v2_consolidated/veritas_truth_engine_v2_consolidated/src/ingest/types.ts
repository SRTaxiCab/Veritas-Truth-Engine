export type SupportedDocumentType = "text/plain" | "text/markdown" | "application/json" | "application/pdf";

export interface IngestDocumentRequest {
  title: string;
  content?: string;
  text?: string;
  rawText?: string;
  base64Content?: string;
  mimeType?: SupportedDocumentType;
  publicImpact?: boolean;
}

export interface IngestedTextDocument {
  id: string;
  title: string;
  mimeType: SupportedDocumentType;
  parserName: string;
  parserVersion: string;
  contentText: string;
  contentHash: string;
}

export interface DocumentChunk {
  id: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
  pageNumber?: number | null;
  sectionLabel?: string | null;
  text: string;
  contentHash: string;
}

export interface ExtractionCandidate {
  id: string;
  sentence: string;
  sentenceIndex: number;
  chunkIndex: number;
  subject: string | null;
  predicate: string;
  object: string | null;
  polarity: "affirmed" | "denied" | "uncertain";
  modality: "asserted_fact" | "allegation" | "opinion" | "forecast" | "quote";
  confidence: number;
  charStart: number;
  charEnd: number;
}
