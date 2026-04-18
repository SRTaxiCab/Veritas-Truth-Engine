import { Claim, TruthAssessment, EvidenceBundle } from "../core/types.js";
import { ReviewTask } from "../review/types.js";
import { FusedEvidenceSummary, MultimodalEvidencePacket } from "../multimodal/types.js";

export interface ClaimReportRecord {
  claim: Claim;
  assessment: TruthAssessment;
  evidence: EvidenceBundle[];
  multimodal?: MultimodalEvidencePacket | null;
  fusedSummary?: FusedEvidenceSummary | null;
  reviewTasks?: ReviewTask[];
}

export interface ReportMetadata {
  reportId: string;
  title: string;
  createdAt: string;
  generatedBy: string;
  product: "ChronoScope" | "Rediscover.ai" | "DeceptionOS" | "Veritas Engine";
  classification?: string;
  subject?: string;
}

export interface ReportDocument {
  metadata: ReportMetadata;
  executiveSummary: string[];
  records: ClaimReportRecord[];
  conclusion: string[];
}
