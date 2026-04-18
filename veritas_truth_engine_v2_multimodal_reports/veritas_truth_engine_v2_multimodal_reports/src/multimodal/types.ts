export type EvidenceModality = "text" | "table" | "image" | "timeline" | "mixed";

export interface TableCell {
  row: number;
  col: number;
  text: string;
  numericValue?: number | null;
}

export interface TableEvidence {
  id: string;
  title?: string;
  headers: string[];
  rows: string[][];
  cells?: TableCell[];
  pageNumber?: number | null;
  confidence?: number;
}

export interface ImageRegionEvidence {
  id: string;
  label: string;
  caption?: string | null;
  pageNumber?: number | null;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  confidence?: number;
  sourceHint?: string | null;
}

export interface MultimodalEvidencePacket {
  claimId: string;
  modality: EvidenceModality;
  summary: string;
  tableEvidence?: TableEvidence[];
  imageEvidence?: ImageRegionEvidence[];
  notes?: string[];
}

export interface FusedEvidenceSummary {
  claimId: string;
  modalityCoverage: EvidenceModality[];
  structuralSupportScore: number;
  structuralContradictionScore: number;
  notes: string[];
}
