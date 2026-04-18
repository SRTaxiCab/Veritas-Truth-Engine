import { NextRequest, NextResponse } from "next/server";
import { query } from "../../lib/db";
import {
  Claim,
  ClaimRelation,
  EvidenceBundle,
  SourceLineageEdge,
  evaluateClaim,
} from "../../lib/weapr_v1";

interface RequestBody {
  claimId: string;
  publicImpact?: boolean;
}

async function loadClaim(claimId: string): Promise<Claim | null> {
  const rows = await query<{
    id: string;
    claim_text: string;
    subject_entity_id: string | null;
    predicate: string;
    object_entity_id: string | null;
    object_literal: string | null;
    polarity: "affirmed" | "denied" | "uncertain";
    modality: "asserted_fact" | "allegation" | "opinion" | "forecast" | "quote";
    time_start: string | null;
    time_end: string | null;
    canonical_fingerprint: string;
  }>(
    `select
      id, claim_text, subject_entity_id, predicate, object_entity_id, object_literal,
      polarity, modality, time_start, time_end, canonical_fingerprint
     from claims
     where id = $1`,
    [claimId]
  );

  if (!rows.length) return null;
  const row = rows[0];

  return {
    id: row.id,
    claimText: row.claim_text,
    subjectEntityId: row.subject_entity_id,
    predicate: row.predicate,
    objectEntityId: row.object_entity_id,
    objectLiteral: row.object_literal,
    polarity: row.polarity,
    modality: row.modality,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    canonicalFingerprint: row.canonical_fingerprint,
  };
}

async function loadEvidence(claimId: string): Promise<EvidenceBundle[]> {
  const rows = await query<any>(
    `select
      es.id as evidence_id,
      es.claim_id,
      es.source_version_id,
      es.page_number,
      es.section_label,
      es.char_start,
      es.char_end,
      es.line_start,
      es.line_end,
      es.quoted_text,
      es.evidence_role,
      es.extraction_confidence as span_extraction_confidence,
      sv.id as sv_id,
      sv.source_id,
      sv.version_number,
      sv.extraction_method,
      sv.extraction_confidence as sv_extraction_confidence,
      sv.content_hash,
      s.id as source_id,
      s.title,
      s.source_type,
      s.origin,
      s.author,
      s.publisher,
      s.published_at,
      s.reliability_prior,
      s.chain_of_custody_score
     from evidence_spans es
     join source_versions sv on sv.id = es.source_version_id
     join sources s on s.id = sv.source_id
     where es.claim_id = $1`,
    [claimId]
  );

  return rows.map((row) => ({
    span: {
      id: row.evidence_id,
      claimId: row.claim_id,
      sourceVersionId: row.source_version_id,
      pageNumber: row.page_number,
      sectionLabel: row.section_label,
      charStart: row.char_start,
      charEnd: row.char_end,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      quotedText: row.quoted_text,
      evidenceRole: row.evidence_role,
      extractionConfidence: row.span_extraction_confidence,
    },
    sourceVersion: {
      id: row.sv_id,
      sourceId: row.source_id,
      versionNumber: row.version_number,
      extractionMethod: row.extraction_method,
      extractionConfidence: row.sv_extraction_confidence,
      contentHash: row.content_hash,
    },
    source: {
      id: row.source_id,
      title: row.title,
      sourceType: row.source_type,
      origin: row.origin,
      author: row.author,
      publisher: row.publisher,
      publishedAt: row.published_at,
      reliabilityPrior: Number(row.reliability_prior),
      chainOfCustodyScore: Number(row.chain_of_custody_score),
    },
  }));
}

async function loadLineage(claimId: string): Promise<SourceLineageEdge[]> {
  return query<SourceLineageEdge>(
    `select distinct
      sl.child_source_id as "childSourceId",
      sl.parent_source_id as "parentSourceId",
      sl.lineage_type as "lineageType",
      sl.confidence
     from source_lineage sl
     where sl.child_source_id in (
       select distinct sv.source_id
       from evidence_spans es
       join source_versions sv on sv.id = es.source_version_id
       where es.claim_id = $1
     )`,
    [claimId]
  );
}

async function loadRelations(claimId: string): Promise<ClaimRelation[]> {
  return query<ClaimRelation>(
    `select
      from_claim_id as "fromClaimId",
      to_claim_id as "toClaimId",
      relation_type as "relationType",
      confidence
     from claim_relations
     where from_claim_id = $1`,
    [claimId]
  );
}

async function persistAssessment(result: ReturnType<typeof evaluateClaim>) {
  const assessmentRows = await query<{ id: string }>(
    `insert into truth_assessments (
      claim_id, model_version, truth_score, truth_state, support_score, risk_penalty,
      source_reliability, evidence_specificity, corroboration_strength, temporal_consistency,
      contradiction_pressure, manipulation_signal, explanation
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb
    )
    returning id`,
    [
      result.claimId,
      result.modelVersion,
      result.truthScore,
      result.truthState,
      result.supportScore,
      result.riskPenalty,
      result.features.sourceReliability,
      result.features.evidenceSpecificity,
      result.features.corroborationStrength,
      result.features.temporalConsistency,
      result.features.contradictionPressure,
      result.features.manipulationSignal,
      JSON.stringify(result.explanation),
    ]
  );

  const assessmentId = assessmentRows[0]?.id;

  if (result.explanation.triggeredReview && assessmentId) {
    for (const reason of result.explanation.reviewReasons) {
      await query(
        `insert into review_queue (claim_id, assessment_id, reason, priority)
         values ($1, $2, $3, $4)`,
        [
          result.claimId,
          assessmentId,
          reason,
          reason === "public_impact_requires_review" ? "high" : "normal",
        ]
      );
    }
  }

  return assessmentId;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;

    if (!body.claimId) {
      return NextResponse.json({ error: "claimId is required" }, { status: 400 });
    }

    const claim = await loadClaim(body.claimId);
    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    const [evidence, sourceLineage, relatedClaimRelations] = await Promise.all([
      loadEvidence(body.claimId),
      loadLineage(body.claimId),
      loadRelations(body.claimId),
    ]);

    const result = evaluateClaim({
      claim,
      evidence,
      sourceLineage,
      relatedClaimRelations,
      publicImpact: Boolean(body.publicImpact),
    });

    const assessmentId = await persistAssessment(result);

    return NextResponse.json({
      ok: true,
      assessmentId,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
