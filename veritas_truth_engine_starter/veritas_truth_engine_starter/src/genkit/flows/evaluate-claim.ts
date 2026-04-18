import { z } from "zod";
import { defineFlow } from "@genkit-ai/flow";
import { evaluateClaim } from "../../lib/weapr_v1";

const ClaimSchema = z.object({
  id: z.string(),
  claimText: z.string(),
  subjectEntityId: z.string().nullable().optional(),
  predicate: z.string(),
  objectEntityId: z.string().nullable().optional(),
  objectLiteral: z.string().nullable().optional(),
  polarity: z.enum(["affirmed", "denied", "uncertain"]),
  modality: z.enum(["asserted_fact", "allegation", "opinion", "forecast", "quote"]),
  timeStart: z.string().nullable().optional(),
  timeEnd: z.string().nullable().optional(),
  canonicalFingerprint: z.string(),
});

const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceType: z.string(),
  origin: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  reliabilityPrior: z.number(),
  chainOfCustodyScore: z.number(),
});

const SourceVersionSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  versionNumber: z.number(),
  extractionMethod: z.string().nullable().optional(),
  extractionConfidence: z.number().nullable().optional(),
  contentHash: z.string(),
});

const EvidenceSpanSchema = z.object({
  id: z.string(),
  claimId: z.string(),
  sourceVersionId: z.string(),
  pageNumber: z.number().nullable().optional(),
  sectionLabel: z.string().nullable().optional(),
  charStart: z.number().nullable().optional(),
  charEnd: z.number().nullable().optional(),
  lineStart: z.number().nullable().optional(),
  lineEnd: z.number().nullable().optional(),
  quotedText: z.string(),
  evidenceRole: z.enum(["supporting", "contradicting", "contextual"]),
  extractionConfidence: z.number().nullable().optional(),
});

const InputSchema = z.object({
  claim: ClaimSchema,
  evidence: z.array(z.object({
    span: EvidenceSpanSchema,
    sourceVersion: SourceVersionSchema,
    source: SourceSchema,
  })),
  relatedClaimRelations: z.array(z.object({
    fromClaimId: z.string(),
    toClaimId: z.string(),
    relationType: z.enum([
      "supports",
      "partially_supports",
      "contradicts",
      "temporally_conflicts",
      "context_conflicts",
      "duplicate",
      "unrelated",
    ]),
    confidence: z.number(),
  })).optional(),
  sourceLineage: z.array(z.object({
    childSourceId: z.string(),
    parentSourceId: z.string().nullable().optional(),
    lineageType: z.enum(["repost", "wire_copy", "quote_chain", "mirror", "summary_of", "derived_from"]),
    confidence: z.number(),
  })).optional(),
  publicImpact: z.boolean().optional(),
});

export const evaluateClaimFlow = defineFlow(
  {
    name: "evaluateClaimFlow",
    inputSchema: InputSchema,
    outputSchema: z.object({
      claimId: z.string(),
      modelVersion: z.string(),
      truthScore: z.number(),
      truthState: z.string(),
      supportScore: z.number(),
      riskPenalty: z.number(),
      features: z.object({
        sourceReliability: z.number(),
        evidenceSpecificity: z.number(),
        corroborationStrength: z.number(),
        temporalConsistency: z.number(),
        contradictionPressure: z.number(),
        manipulationSignal: z.number(),
      }),
      explanation: z.object({
        supportingSourceCount: z.number(),
        contradictingSourceCount: z.number(),
        independentSupportingSourceCount: z.number(),
        independentContradictingSourceCount: z.number(),
        triggeredReview: z.boolean(),
        reviewReasons: z.array(z.string()),
      }),
    }),
  },
  async (input) => evaluateClaim(input)
);
