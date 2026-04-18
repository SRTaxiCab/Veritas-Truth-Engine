import { exportReport } from "../api/export-report.js";
import { sampleInput } from "./sample-input.js";
import { evaluateClaimV2 } from "../core/truth-engine-v2.js";
import { buildImageEvidence } from "../multimodal/image-evidence.js";
import { tableFromMatrix } from "../multimodal/table-extractor.js";
import { fuseMultimodalEvidence } from "../multimodal/evidence-fusion.js";
import { ClaimReportRecord } from "../reports/types.js";

const assessment = evaluateClaimV2(sampleInput);
const multimodal = {
  claimId: sampleInput.claim.id,
  modality: "mixed" as const,
  summary: "Claim is reinforced by a table and a timeline figure.",
  tableEvidence: [
    tableFromMatrix(
      "tbl_demo_01",
      [
        ["Year", "Documents", "Mentions"],
        ["1982", "4", "3"],
        ["1983", "6", "5"],
      ],
      { title: "Mention continuity", pageNumber: 2, confidence: 0.81 }
    ),
  ],
  imageEvidence: [
    buildImageEvidence("img_demo_01", "timeline figure", {
      caption: "Operational sequence derived from archive timeline.",
      pageNumber: 3,
      confidence: 0.74,
    }),
  ],
  notes: ["demo_multimodal_packet"],
};

const fusedSummary = fuseMultimodalEvidence(multimodal);

const record: ClaimReportRecord = {
  claim: sampleInput.claim,
  assessment,
  evidence: sampleInput.evidence,
  multimodal,
  fusedSummary,
  reviewTasks: [],
};

const response = exportReport({
  metadata: {
    reportId: "rpt_demo_001",
    title: "ChronoScope Evidence Adjudication Report",
    createdAt: new Date().toISOString(),
    generatedBy: "Truth Engine v2.6.0",
    product: "ChronoScope",
    classification: "Internal Research Use",
    subject: "Historical event reconstruction demo",
  },
  records: [record],
  format: "markdown",
});

console.log(response.content);
