import { query, pool } from "./db";
import { evaluateClaim, Claim, EvidenceBundle } from "./weapr_v1";

async function seed() {
  const sourceRows = await query<{ id: string }>(
    `insert into sources (title, source_type, origin, author, publisher, published_at, reliability_prior, chain_of_custody_score)
     values
      ('Declassified Operations Report', 'government_record', 'National Archives', 'Department Records Office', 'National Archives', '1988-01-01T00:00:00Z', 0.88, 0.92),
      ('Witness Testimony Transcript', 'transcript', 'Senate Committee Archive', 'Witness B', 'Committee Archive', '1990-05-20T00:00:00Z', 0.72, 0.80),
      ('Press Statement', 'article', 'Agency Press Office', 'Agency Spokesperson', 'Agency Press Office', '1989-01-01T00:00:00Z', 0.55, 0.75)
     returning id`
  );

  const [src1, src2, src3] = sourceRows.map((r) => r.id);

  const sourceVersionRows = await query<{ id: string; source_id: string }>(
    `insert into source_versions (source_id, version_number, content_hash, extraction_method, extraction_confidence, raw_text)
     values
      ($1, 1, 'hash-1', 'pdf_parser_v2', 0.96, 'Agency A coordinated the logistics branch of Operation X.'),
      ($2, 1, 'hash-2', 'ocr_v1', 0.82, 'Operation X logistics were run by Agency A.'),
      ($3, 1, 'hash-3', 'manual_entry', 0.90, 'Agency A had no operational role in Operation X.')
     returning id, source_id`,
    [src1, src2, src3]
  );

  const sv1 = sourceVersionRows[0].id;
  const sv2 = sourceVersionRows[1].id;
  const sv3 = sourceVersionRows[2].id;

  await query(`update sources set current_version_id = sv.id from source_versions sv where sources.id = sv.source_id and sv.version_number = 1`);

  const entityRows = await query<{ id: string }>(
    `insert into entities (entity_type, canonical_name)
     values ('organization', 'Agency A'), ('event', 'Operation X')
     returning id`
  );

  const agencyA = entityRows[0].id;
  const operationX = entityRows[1].id;

  const claimRows = await query<{ id: string }>(
    `insert into claims (
      claim_text, subject_entity_id, predicate, object_entity_id, object_literal,
      polarity, modality, time_start, time_end, canonical_fingerprint, extracted_by, extraction_confidence
    ) values (
      'Agency A coordinated Operation X.', $1, 'coordinated', $2, null,
      'affirmed', 'asserted_fact', '1982-01-01T00:00:00Z', '1986-12-31T23:59:59Z',
      'agency_a|coordinated|operation_x', 'seed_script', 0.99
    )
    returning id`,
    [agencyA, operationX]
  );

  const claimId = claimRows[0].id;

  await query(
    `insert into evidence_spans (
      claim_id, source_version_id, page_number, line_start, line_end,
      quoted_text, span_hash, evidence_role, extraction_confidence
    ) values
      ($1, $2, 14, 10, 16, 'Agency A coordinated the logistics branch of Operation X.', 'span-1', 'supporting', 0.95),
      ($1, $3, 3, null, null, 'Operation X logistics were run by Agency A.', 'span-2', 'supporting', 0.87),
      ($1, $4, 1, null, null, 'Agency A had no operational role in Operation X.', 'span-3', 'contradicting', 0.84)
    `,
    [claimId, sv1, sv2, sv3]
  );

  const claim: Claim = {
    id: claimId,
    claimText: 'Agency A coordinated Operation X.',
    predicate: 'coordinated',
    objectEntityId: operationX,
    polarity: 'affirmed',
    modality: 'asserted_fact',
    canonicalFingerprint: 'agency_a|coordinated|operation_x',
    timeStart: '1982-01-01T00:00:00Z',
    timeEnd: '1986-12-31T23:59:59Z',
    subjectEntityId: agencyA,
  };

  const sourceLookup = await query<any>(
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

  const evidence: EvidenceBundle[] = sourceLookup.map((row: any) => ({
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

  const result = evaluateClaim({
    claim,
    evidence,
    publicImpact: true,
  });

  await query(
    `insert into truth_assessments (
      claim_id, model_version, truth_score, truth_state, support_score, risk_penalty,
      source_reliability, evidence_specificity, corroboration_strength, temporal_consistency,
      contradiction_pressure, manipulation_signal, explanation
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb
    )`,
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

  console.log("Seed complete.");
  console.log(JSON.stringify(result, null, 2));
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
