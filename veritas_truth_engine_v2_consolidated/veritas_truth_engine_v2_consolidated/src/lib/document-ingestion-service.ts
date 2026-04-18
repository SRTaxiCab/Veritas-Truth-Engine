import { evaluateClaimV2 } from "../core/truth-engine-v2.js";
import type { Claim, EvidenceBundle, EvaluateClaimInput, Source, SourceVersion, TruthAssessment } from "../core/types.js";
import { chunkText, hashText, stableId } from "../ingest/chunker.js";
import { parseDocumentBuffer } from "../ingest/parsers.js";
import type { DocumentChunk, ExtractionCandidate, IngestDocumentRequest, IngestedTextDocument, SupportedDocumentType } from "../ingest/types.js";
import { candidateToClaim, extractClaimCandidatesFromChunk } from "../pipeline/claim-extractor.js";
import { deriveClaimRelations } from "../pipeline/relations.js";

export interface IngestedClaimPackage {
  candidate: ExtractionCandidate;
  claim: Claim;
  evidence: EvidenceBundle[];
  assessment: TruthAssessment;
  claimPackage: EvaluateClaimInput;
}

export interface IngestDocumentResult {
  ok: true;
  document: IngestedTextDocument;
  source: Source;
  sourceVersion: SourceVersion;
  chunks: DocumentChunk[];
  candidates: ExtractionCandidate[];
  relations: ReturnType<typeof deriveClaimRelations>;
  claimPackages: IngestedClaimPackage[];
  reviewCount: number;
}

function requestBuffer(request: IngestDocumentRequest): Buffer {
  if (request.base64Content) {
    return Buffer.from(request.base64Content, "base64");
  }

  return Buffer.from(request.content ?? request.text ?? request.rawText ?? "", "utf8");
}

function sourceTypeFor(mimeType: SupportedDocumentType): string {
  if (mimeType === "application/pdf") return "pdf_document";
  if (mimeType === "application/json") return "structured_json";
  if (mimeType === "text/markdown") return "markdown_document";
  return "text_document";
}

function buildEvidenceBundle(
  document: IngestedTextDocument,
  candidate: ExtractionCandidate,
  source: Source,
  sourceVersion: SourceVersion
): EvidenceBundle {
  return {
    span: {
      id: stableId("ev", `${document.id}:${candidate.id}:${candidate.sentence}`),
      claimId: stableId(
        "clm",
        `${candidate.subject ?? ""}|${candidate.predicate}|${candidate.object ?? ""}|${candidate.polarity}`.toLowerCase()
      ),
      sourceVersionId: sourceVersion.id,
      quotedText: candidate.sentence,
      evidenceRole: "supporting",
      charStart: candidate.charStart,
      charEnd: candidate.charEnd,
      extractionConfidence: candidate.confidence,
    },
    sourceVersion,
    source,
  };
}

export class DocumentIngestionService {
  ingest(request: IngestDocumentRequest): IngestDocumentResult {
    const mimeType = request.mimeType ?? "text/plain";
    const title = request.title?.trim() || "Untitled Document";
    const document = parseDocumentBuffer(requestBuffer(request), mimeType, title);

    if (!document.contentText) {
      throw new Error("No extractable document text was found.");
    }

    const chunks = chunkText(document.contentText);
    const candidates = chunks.flatMap((chunk) => extractClaimCandidatesFromChunk(chunk)).slice(0, 12);
    const claims = candidates.map((candidate) => candidateToClaim(candidate, Boolean(request.publicImpact)));
    const relations = deriveClaimRelations(claims);

    const source: Source = {
      id: stableId("src", `${document.title}:${document.contentHash}`),
      title: document.title,
      sourceType: sourceTypeFor(document.mimeType),
      origin: "Veritas Ingestion Workspace",
      author: null,
      publisher: null,
      publishedAt: null,
      acquiredAt: new Date().toISOString(),
      reliabilityPrior: document.mimeType === "application/pdf" ? 0.72 : 0.68,
      chainOfCustodyScore: 0.78,
      primarySource: true,
    };

    const sourceVersion: SourceVersion = {
      id: stableId("sv", `${source.id}:v1:${document.contentHash}`),
      sourceId: source.id,
      versionNumber: 1,
      extractionMethod: document.parserName,
      extractionConfidence: document.mimeType === "application/pdf" ? 0.82 : 0.94,
      contentHash: hashText(document.contentText),
    };

    const claimPackages = candidates.map((candidate, index) => {
      const claim = claims[index]!;
      const evidence = [buildEvidenceBundle(document, candidate, source, sourceVersion)];
      const claimPackage: EvaluateClaimInput = {
        claim,
        evidence,
        claimRelations: relations.filter((relation) => relation.fromClaimId === claim.id || relation.toClaimId === claim.id),
        sourceLineage: [],
        causalLinks: [],
      };
      return {
        candidate,
        claim,
        evidence,
        claimPackage,
        assessment: evaluateClaimV2(claimPackage),
      };
    });

    return {
      ok: true,
      document,
      source,
      sourceVersion,
      chunks,
      candidates,
      relations,
      claimPackages,
      reviewCount: claimPackages.filter((item) => item.assessment.releaseState !== "auto_release").length,
    };
  }
}
