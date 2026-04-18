export type SupportedDocumentType = "text/plain" | "text/markdown" | "application/json" | "application/pdf";

export interface IngestedTextDocument {
  title: string;
  mimeType: SupportedDocumentType;
  parserName: string;
  parserVersion: string;
  contentText: string;
}

export interface DocumentChunk {
  chunkIndex: number;
  charStart: number;
  charEnd: number;
  pageNumber?: number | null;
  sectionLabel?: string | null;
  text: string;
}

export interface ExtractionCandidate {
  sentence: string;
  sentenceIndex: number;
  subject: string | null;
  predicate: string;
  object: string | null;
  polarity: "affirmed" | "denied" | "uncertain";
  modality: "asserted_fact" | "allegation" | "opinion" | "forecast" | "quote";
  confidence: number;
  charStart: number;
  charEnd: number;
}
