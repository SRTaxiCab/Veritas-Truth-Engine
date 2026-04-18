import crypto from "node:crypto";
import type { Claim, EvidenceBundle, EvidenceSpan, Source, SourceVersion } from "../core/types.js";
import type { TextChunk } from "../ingest/chunker.js";

export interface ExtractedClaimPackage {
  claim: Claim;
  evidence: EvidenceBundle[];
}

const DENIAL_MARKERS = [/\bnot\b/i, /\bnever\b/i, /\bno evidence\b/i, /\bfalse\b/i, /\bdenied\b/i];
const ALLEGATION_MARKERS = [/\balleg(ed|ation)\b/i, /\breportedly\b/i, /\bclaimed\b/i, /\baccording to\b/i];

function sentenceSplit(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fingerprint(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function inferPredicate(sentence: string): string {
  const verbs = ["was", "were", "is", "are", "caused", "ordered", "led", "shows", "states", "proves", "denies"];
  const lower = sentence.toLowerCase();
  const found = verbs.find((v) => lower.includes(` ${v} `));
  return found ?? "states";
}

function inferPolarity(sentence: string): Claim["polarity"] {
  return DENIAL_MARKERS.some((r) => r.test(sentence)) ? "denied" : "affirmed";
}

function inferModality(sentence: string): Claim["modality"] {
  return ALLEGATION_MARKERS.some((r) => r.test(sentence)) ? "allegation" : "asserted_fact";
}

export function extractClaimsFromChunks(
  chunks: TextChunk[],
  source: Source,
  sourceVersion: SourceVersion
): ExtractedClaimPackage[] {
  const out: ExtractedClaimPackage[] = [];

  for (const chunk of chunks) {
    const sentences = sentenceSplit(chunk.text);
    for (const sentence of sentences) {
      if (sentence.length < 40) continue;

      const claimId = `clm_${fingerprint(source.id + sourceVersion.id + sentence).slice(0, 12)}`;
      const predicate = inferPredicate(sentence);
      const polarity = inferPolarity(sentence);
      const modality = inferModality(sentence);
      const canonicalFingerprint = fingerprint(
        sentence.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
      );

      const claim: Claim = {
        id: claimId,
        claimText: sentence,
        subject: null,
        predicate,
        object: null,
        polarity,
        modality,
        canonicalFingerprint,
        publicImpact: false
      };

      const startOffset = chunk.text.indexOf(sentence);
      const evidenceSpan: EvidenceSpan = {
        id: `ev_${fingerprint(claimId + sentence).slice(0, 12)}`,
        claimId: claim.id,
        sourceVersionId: sourceVersion.id,
        quotedText: sentence,
        evidenceRole: polarity === "denied" ? "contradicting" : "supporting",
        charStart: chunk.charStart + Math.max(startOffset, 0),
        charEnd: chunk.charStart + Math.max(startOffset, 0) + sentence.length,
        sectionLabel: `chunk_${chunk.index + 1}`,
        extractionConfidence: modality === "allegation" ? 0.68 : 0.82
      };

      out.push({
        claim,
        evidence: [{ span: evidenceSpan, sourceVersion, source }]
      });
    }
  }

  return out;
}
