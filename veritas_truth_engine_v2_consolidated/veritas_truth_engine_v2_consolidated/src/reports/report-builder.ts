import { ClaimReportRecord, ReportDocument, ReportMetadata } from "./types.js";

function buildExecutiveSummary(records: ClaimReportRecord[]): string[] {
  const counts = {
    strongly_supported: 0,
    supported: 0,
    mixed_or_unresolved: 0,
    contested: 0,
    likely_false: 0,
    insufficient_evidence: 0,
  };

  for (const record of records) {
    counts[record.assessment.truthState] += 1;
  }

  return [
    `Total claims assessed: ${records.length}.`,
    `Strongly supported/supportive claims: ${counts.strongly_supported + counts.supported}.`,
    `Mixed or unresolved claims: ${counts.mixed_or_unresolved}.`,
    `Contested or likely false claims: ${counts.contested + counts.likely_false}.`,
    `Claims with insufficient evidence: ${counts.insufficient_evidence}.`,
  ];
}

function buildConclusion(records: ClaimReportRecord[]): string[] {
  const reviewRequired = records.filter((r) => r.assessment.releaseState !== "auto_release").length;
  const multimodalCount = records.filter((r) => !!r.multimodal).length;

  return [
    `The current evidence package supports automatic release for ${records.length - reviewRequired} assessed claims.`,
    `${reviewRequired} claims require human review or hold status before publication.`,
    `${multimodalCount} claims include non-textual or mixed-modality supporting material.`,
    `All claims remain probabilistic adjudications rather than declarations of absolute certainty.`,
  ];
}

export function buildReportDocument(
  metadata: ReportMetadata,
  records: ClaimReportRecord[]
): ReportDocument {
  return {
    metadata,
    executiveSummary: buildExecutiveSummary(records),
    records,
    conclusion: buildConclusion(records),
  };
}
