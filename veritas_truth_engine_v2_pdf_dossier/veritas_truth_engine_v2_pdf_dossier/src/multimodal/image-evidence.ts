import { ImageRegionEvidence } from "./types";

export function buildImageEvidence(
  id: string,
  label: string,
  options?: {
    caption?: string | null;
    pageNumber?: number | null;
    confidence?: number;
    sourceHint?: string | null;
    boundingBox?: { x: number; y: number; width: number; height: number } | null;
  }
): ImageRegionEvidence {
  return {
    id,
    label,
    caption: options?.caption ?? null,
    pageNumber: options?.pageNumber ?? null,
    confidence: options?.confidence ?? 0.65,
    sourceHint: options?.sourceHint ?? null,
    boundingBox: options?.boundingBox ?? null,
  };
}

export function detectImageClaimSignals(imageEvidence: ImageRegionEvidence[]): string[] {
  const notes: string[] = [];
  if (imageEvidence.length > 0) {
    notes.push("image_or_figure_evidence_present");
  }
  if (imageEvidence.some((item) => /map|timeline|chart|graph/i.test(`${item.label} ${item.caption ?? ""}`))) {
    notes.push("image_evidence_has_structural_interpretation_value");
  }
  if (imageEvidence.some((item) => (item.confidence ?? 0) < 0.5)) {
    notes.push("some_image_regions_are_low_confidence");
  }
  return notes;
}
