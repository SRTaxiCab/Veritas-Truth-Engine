import { Pool } from "pg";
import { pool } from "./db";
import { Claim, EvidenceBundle, Source, SourceVersion, EvidenceSpan, ClaimRelation } from "../core/types";
import { DocumentChunk, IngestedTextDocument, ExtractionCandidate } from "../ingest/types";
import { hashChunk } from "../ingest/chunker";

export interface PersistedIngestionResult {
  ingestedDocumentId: string;
  extractionRunId: string;
  claims: Claim[];
  evidence: EvidenceBundle[];
}

export class PostgresIngestionRepository {
  constructor(private readonly db: Pool = pool) {}

  async createSource(title: string, mimeType: string): Promise<{ sourceId: string; sourceVersionId: string; documentId: string }> {
    const source = await this.db.query(
      `insert into sources (title, source_type, origin, reliability_prior, chain_of_custody_score)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [title, 'ingested_document', 'ChronoScope Ingestion', 0.7, 0.8]
    );
    const sourceId = source.rows[0].id;
    const sourceVersion = await this.db.query(
      `insert into source_versions (source_id, version_number, content_hash, mime_type, extraction_method, extraction_confidence, raw_text)
       values ($1, 1, md5($2), $3, 'ingestion_v2', 0.95, $2)
       returning id`,
      [sourceId, title + Date.now().toString(), mimeType]
    );
    const sourceVersionId = sourceVersion.rows[0].id;
    const document = await this.db.query(
      `insert into documents (source_version_id, file_name) values ($1, $2) returning id`,
      [sourceVersionId, title]
    );
    return { sourceId, sourceVersionId, documentId: document.rows[0].id };
  }

  async persistIngestion(doc: IngestedTextDocument, chunks: DocumentChunk[], candidates: ExtractionCandidate[], claims: Claim[], relations: ClaimRelation[]): Promise<PersistedIngestionResult> {
    const client = await this.db.connect();
    try {
      await client.query('begin');
      const src = await this.createSource(doc.title, doc.mimeType);
      await client.query('update source_versions set raw_text = $2, content_hash = md5($2) where id = $1', [src.sourceVersionId, doc.contentText]);
      const ingested = await client.query(
        `insert into ingested_documents (source_version_id, document_id, title, mime_type, parser_name, parser_version, content_text)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [src.sourceVersionId, src.documentId, doc.title, doc.mimeType, doc.parserName, doc.parserVersion, doc.contentText]
      );
      const ingestedDocumentId = ingested.rows[0].id;
      const extractionRun = await client.query(
        `insert into extraction_runs (ingested_document_id, extractor_name, extractor_version, metadata)
         values ($1,$2,$3,$4) returning id`,
        [ingestedDocumentId, 'heuristic_claim_extractor', '1.0.0', JSON.stringify({ candidateCount: candidates.length })]
      );
      const extractionRunId = extractionRun.rows[0].id;

      const chunkIds: string[] = [];
      for (const chunk of chunks) {
        const inserted = await client.query(
          `insert into document_chunks (ingested_document_id, chunk_index, page_number, section_label, char_start, char_end, text_content, content_hash)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [ingestedDocumentId, chunk.chunkIndex, chunk.pageNumber ?? null, chunk.sectionLabel ?? null, chunk.charStart, chunk.charEnd, chunk.text, hashChunk(chunk.text)]
        );
        chunkIds.push(inserted.rows[0].id);
      }

      const evidenceBundles: EvidenceBundle[] = [];
      for (let i = 0; i < claims.length; i += 1) {
        const claim = claims[i];
        const candidate = candidates[i];
        const chunk = chunks.find((c) => candidate.charStart >= c.charStart && candidate.charEnd <= c.charEnd) ?? chunks[0];
        const chunkId = chunkIds[chunks.indexOf(chunk)];
        await client.query(
          `insert into claims (id, claim_text, predicate, object_literal, polarity, modality, canonical_fingerprint, extracted_by, extraction_confidence)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (id) do update set claim_text = excluded.claim_text, extraction_confidence = excluded.extraction_confidence`,
          [claim.id, claim.claimText, claim.predicate, claim.objectLiteral ?? null, claim.polarity, claim.modality, claim.canonicalFingerprint, 'heuristic_claim_extractor', candidate.confidence]
        );
        const evidence = await client.query(
          `insert into evidence_spans (claim_id, source_version_id, document_id, char_start, char_end, quoted_text, span_hash, evidence_role, extraction_confidence)
           values ($1,$2,$3,$4,$5,$6,md5($6),$7,$8) returning id`,
          [claim.id, src.sourceVersionId, src.documentId, candidate.charStart, candidate.charEnd, candidate.sentence, 'supporting', candidate.confidence]
        );
        await client.query(
          `insert into claim_occurrences (claim_id, extraction_run_id, document_chunk_id, occurrence_text, sentence_index)
           values ($1,$2,$3,$4,$5)`,
          [claim.id, extractionRunId, chunkId, candidate.sentence, candidate.sentenceIndex]
        );
        const source: Source = {
          id: src.sourceId,
          title: doc.title,
          sourceType: 'ingested_document',
          origin: 'ChronoScope Ingestion',
          reliabilityPrior: 0.7,
          chainOfCustodyScore: 0.8,
        };
        const sourceVersion: SourceVersion = {
          id: src.sourceVersionId,
          sourceId: src.sourceId,
          versionNumber: 1,
          extractionMethod: doc.parserName,
          extractionConfidence: 0.95,
          contentHash: 'md5',
        };
        const span: EvidenceSpan = {
          id: evidence.rows[0].id,
          claimId: claim.id,
          sourceVersionId: src.sourceVersionId,
          charStart: candidate.charStart,
          charEnd: candidate.charEnd,
          quotedText: candidate.sentence,
          evidenceRole: 'supporting',
          extractionConfidence: candidate.confidence,
        };
        evidenceBundles.push({ span, sourceVersion, source });
      }

      for (const relation of relations) {
        await client.query(
          `insert into claim_relations (from_claim_id, to_claim_id, relation_type, confidence, detected_by)
           values ($1,$2,$3,$4,$5)
           on conflict do nothing`,
          [relation.fromClaimId, relation.toClaimId, relation.relationType, relation.confidence, 'heuristic_relations_v1']
        );
      }

      await client.query('commit');
      return { ingestedDocumentId, extractionRunId, claims, evidence: evidenceBundles };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
