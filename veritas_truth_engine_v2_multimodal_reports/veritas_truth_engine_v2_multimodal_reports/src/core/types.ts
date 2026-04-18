export type UUID = string;

export type TruthState =
  | "strongly_supported"
  | "supported"
  | "mixed_or_unresolved"
  | "contested"
  | "likely_false"
  | "insufficient_evidence";

export type ReleaseState = "auto_release" | "review_required" | "hold";

export type EvidenceRole = "supporting" | "contradicting" | "contextual";

export interface Source {
  id: UUID;
  title: string;
  sourceType: string;
  origin?: string | null;
  author?: string | null;
  publisher?: string | null;
  publishedAt?: string | null;
  acquiredAt?: string | null;
  reliabilityPrior: number;
  chainOfCustodyScore: number;
  primarySource: boolean;
}

export interface SourceVersion {
  id: UUID;
  sourceId: UUID;
  versionNumber: number;
  extractionMethod?: string | null;
  extractionConfidence?: number | null;
  contentHash: string;
  supersedesVersionId?: UUID | null;
  revisionReason?: string | null;
}

export interface Claim {
  id: UUID;
  claimText: string;
  subject?: string | null;
  predicate: string;
  object?: string | null;
  polarity: "affirmed" | "denied" | "uncertain";
  modality: "asserted_fact" | "allegation" | "opinion" | "forecast" | "quote";
  canonicalFingerprint: string;
  timeStart?: string | null;
  timeEnd?: string | null;
  location?: string | null;
  publicImpact?: boolean;
}

export interface EvidenceSpan {
  id: UUID;
  claimId: UUID;
  sourceVersionId: UUID;
  quotedText: string;
  evidenceRole: EvidenceRole;
  pageNumber?: number | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  charStart?: number | null;
  charEnd?: number | null;
  sectionLabel?: string | null;
  extractionConfidence?: number | null;
}

export interface SourceLineageEdge {
  childSourceId: UUID;
  parentSourceId?: UUID | null;
  lineageType: "repost" | "wire_copy" | "quote_chain" | "mirror" | "summary_of" | "derived_from";
  confidence: number;
}

export interface ClaimRelation {
  fromClaimId: UUID;
  toClaimId: UUID;
  relationType:
    | "supports"
    | "partially_supports"
    | "contradicts"
    | "temporally_conflicts"
    | "scope_conflicts"
    | "reframes"
    | "duplicate"
    | "unrelated";
  confidence: number;
}

export interface CausalLink {
  causeClaimId: UUID;
  effectClaimId: UUID;
  confidence: number;
  relationLabel?: string;
}

export interface EvidenceBundle {
  span: EvidenceSpan;
  sourceVersion: SourceVersion;
  source: Source;
}

export interface FeatureVector {
  evidenceSupport: number;
  sourceReliability: number;
  provenanceIntegrity: number;
  independenceAdjustedCorroboration: number;
  temporalCoherence: number;
  causalCoherence: number;
  contradictionPressure: number;
  revisionStability: number;
  deceptionSignal: number;
}

export interface ExplanationTrace {
  independentSupportingSourceCount: number;
  independentContradictingSourceCount: number;
  dependencyCollapseFactor: number;
  reviewReasons: string[];
  releaseRationale: string[];
}

export interface TruthAssessment {
  claimId: UUID;
  modelVersion: string;
  posteriorTruthScore: number;
  confidenceBand: number;
  truthState: TruthState;
  releaseState: ReleaseState;
  features: FeatureVector;
  explanation: ExplanationTrace;
}

export interface EvaluateClaimInput {
  claim: Claim;
  evidence: EvidenceBundle[];
  claimRelations?: ClaimRelation[];
  sourceLineage?: SourceLineageEdge[];
  causalLinks?: CausalLink[];
}
