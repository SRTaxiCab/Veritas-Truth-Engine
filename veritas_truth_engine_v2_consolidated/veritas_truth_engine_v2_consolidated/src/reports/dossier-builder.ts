import { Claim } from "../core/types.js";
import { ReviewTask } from "../review/types.js";
import { buildProvenanceGraphPayload } from "../provenance/build-dossier.js";
import { ProvenanceGraphPayload } from "../provenance/types.js";
import { ClaimReportRecord, ReportDocument, ReportMetadata } from "./types.js";

export interface EvidenceDossierDocument extends ReportDocument {
  provenance: ProvenanceGraphPayload;
  releaseRecommendation: string;
  chainOfCustodyNotes: string[];
}

function buildReleaseRecommendation(records: ClaimReportRecord[]): string {
  const holdCount = records.filter((record) => record.assessment.releaseState === "hold").length;
  const reviewCount = records.filter((record) => record.assessment.releaseState === "review_required").length;

  if (holdCount > 0) {
    return `Do not release externally. ${holdCount} claim(s) remain on hold and require adjudication before publication.`;
  }

  if (reviewCount > 0) {
    return `Restricted internal release only. ${reviewCount} claim(s) require reviewer validation before public dissemination.`;
  }

  return "Eligible for controlled external release. No assessed claim is currently marked hold or review required.";
}

function buildChainOfCustodyNotes(records: ClaimReportRecord[]): string[] {
  const totalEvidence = records.reduce((sum, record) => sum + record.evidence.length, 0);
  const sourceTypes = [...new Set(records.flatMap((record) => record.evidence.map((bundle) => bundle.source.sourceType)))].sort();

  return [
    `Evidence items included in this dossier: ${totalEvidence}.`,
    `Distinct source classes represented: ${sourceTypes.join(", ") || "none"}.`,
    "All conclusions remain probabilistic adjudications tied to currently ingested evidence, not declarations of absolute certainty.",
  ];
}

export function buildEvidenceDossierDocument(
  metadata: ReportMetadata,
  records: ClaimReportRecord[]
): EvidenceDossierDocument {
  const claims: Claim[] = records.map((record) => record.claim);
  const assessments = records.map((record) => record.assessment);
  const evidenceByClaimId = Object.fromEntries(records.map((record) => [record.claim.id, record.evidence]));
  const reviewTasksByClaimId = Object.fromEntries(
    records
      .filter((record) => (record.reviewTasks ?? []).length > 0)
      .map((record) => [record.claim.id, record.reviewTasks as ReviewTask[]])
  );

  const provenance = buildProvenanceGraphPayload({
    claims,
    assessments,
    evidenceByClaimId,
    reviewTasksByClaimId,
  });

  return {
    metadata,
    executiveSummary: [
      `Prepared for ${metadata.product}.`,
      `Claims covered by dossier: ${records.length}.`,
      `Claims requiring reviewer involvement: ${records.filter((record) => (record.reviewTasks ?? []).length > 0).length}.`,
    ],
    records,
    conclusion: [
      buildReleaseRecommendation(records),
      "Use the provenance chain to inspect each support and contradiction pathway before publication or downstream citation.",
    ],
    provenance,
    releaseRecommendation: buildReleaseRecommendation(records),
    chainOfCustodyNotes: buildChainOfCustodyNotes(records),
  };
}
