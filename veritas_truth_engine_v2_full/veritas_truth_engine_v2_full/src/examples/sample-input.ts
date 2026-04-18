
import type { EvaluateClaimInput } from "../core/types.js";

export const sampleInput: EvaluateClaimInput = {
  claim: {
    id: "clm_hist_001",
    claimText: "Archive records show that Committee Alpha revised its public account after the internal memorandum was circulated.",
    predicate: "revised_public_account_after_internal_memorandum",
    objectLiteral: "Committee Alpha public account revision",
    polarity: "affirmed",
    modality: "asserted_fact",
    canonicalFingerprint: "committee_alpha|revised_public_account_after_internal_memorandum|memo",
    timeStart: "1979-01-01T00:00:00Z",
    timeEnd: "1981-12-31T23:59:59Z"
  },
  evidence: [
    {
      span: {
        id: "ev_sup_1",
        claimId: "clm_hist_001",
        sourceVersionId: "sv_arch_1",
        pageNumber: 12,
        lineStart: 4,
        lineEnd: 18,
        quotedText: "Following circulation of the internal memorandum, the Committee updated its public statement to remove references to prior operational awareness.",
        evidenceRole: "supporting",
        extractionConfidence: 0.95
      },
      sourceVersion: {
        id: "sv_arch_1",
        sourceId: "src_arch_1",
        versionNumber: 1,
        extractionMethod: "pdf_parser_v3",
        extractionConfidence: 0.97,
        contentHash: "hash-arch-1"
      },
      source: {
        id: "src_arch_1",
        title: "Committee Internal Records",
        sourceType: "government_record",
        origin: "National Archive",
        author: "Records Division",
        publisher: "National Archive",
        publishedAt: "1982-01-15T00:00:00Z",
        reliabilityPrior: 0.91,
        chainOfCustodyScore: 0.94
      }
    },
    {
      span: {
        id: "ev_sup_2",
        claimId: "clm_hist_001",
        sourceVersionId: "sv_wit_1",
        pageNumber: 3,
        quotedText: "The memo changed how the Committee described the incident in all subsequent briefings.",
        evidenceRole: "supporting",
        extractionConfidence: 0.83
      },
      sourceVersion: {
        id: "sv_wit_1",
        sourceId: "src_wit_1",
        versionNumber: 1,
        extractionMethod: "ocr_v2",
        extractionConfidence: 0.79,
        contentHash: "hash-wit-1"
      },
      source: {
        id: "src_wit_1",
        title: "Witness Deposition",
        sourceType: "transcript",
        origin: "Oversight Hearing",
        author: "Witness K",
        publisher: "Oversight Hearing",
        publishedAt: "1983-04-11T00:00:00Z",
        reliabilityPrior: 0.74,
        chainOfCustodyScore: 0.81
      }
    },
    {
      span: {
        id: "ev_con_1",
        claimId: "clm_hist_001",
        sourceVersionId: "sv_pr_1",
        pageNumber: 1,
        quotedText: "The Committee denies that any internal memorandum altered its public position.",
        evidenceRole: "contradicting",
        extractionConfidence: 0.90
      },
      sourceVersion: {
        id: "sv_pr_1",
        sourceId: "src_pr_1",
        versionNumber: 1,
        extractionMethod: "manual_entry",
        extractionConfidence: 0.92,
        contentHash: "hash-pr-1"
      },
      source: {
        id: "src_pr_1",
        title: "Committee Press Office Statement",
        sourceType: "article",
        origin: "Committee Press Office",
        author: "Press Secretary",
        publisher: "Committee Press Office",
        publishedAt: "1982-02-01T00:00:00Z",
        reliabilityPrior: 0.58,
        chainOfCustodyScore: 0.73
      }
    }
  ],
  sourceLineage: [],
  relatedClaimRelations: [
    {
      fromClaimId: "clm_hist_001",
      toClaimId: "clm_hist_002",
      relationType: "contradicts",
      confidence: 0.71
    }
  ],
  publicImpact: true
};
