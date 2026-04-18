import { Claim } from "../core/types.js";
import { stableId } from "../ingest/chunker.js";
import { DocumentChunk, ExtractionCandidate } from "../ingest/types.js";

const MODALITY_PATTERNS = {
  allegation: /\b(alleged|allegedly|reportedly|is said to|claims? that)\b/i,
  opinion: /\b(i think|in my view|arguably|appears to)\b/i,
  quote: /^\s*["“]/,
  forecast: /\b(will|would|could|may|might)\b/i,
};

const NEGATION = /\b(no|not|never|none|without|did not|was not|were not|is not|are not|denied)\b/i;
const ASSERTION =
  /\b(is|are|was|were|has|have|had|did|occurred|happened|involved|directed|coordinated|authorized|signed|funded|concealed|disclosed|recorded|reported|stated|revised|changed|completed|published|removed|confirmed)\b/i;

function splitSentences(text: string): Array<{ sentence: string; start: number; end: number }> {
  const out: Array<{ sentence: string; start: number; end: number }> = [];
  const regex = /[^.!?\n]+[.!?]?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const sentence = match[0].replace(/\s+/g, " ").trim();
    if (sentence.length >= 25) {
      out.push({ sentence, start: match.index, end: match.index + match[0].length });
    }
  }

  return out;
}

function inferModality(sentence: string): ExtractionCandidate["modality"] {
  if (MODALITY_PATTERNS.quote.test(sentence)) return "quote";
  if (MODALITY_PATTERNS.allegation.test(sentence)) return "allegation";
  if (MODALITY_PATTERNS.opinion.test(sentence)) return "opinion";
  if (MODALITY_PATTERNS.forecast.test(sentence)) return "forecast";
  return "asserted_fact";
}

function extractSPO(sentence: string): Pick<ExtractionCandidate, "subject" | "predicate" | "object"> {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /^([A-Z][A-Za-z0-9,'\-() ]{1,80}?)\s+(is|are|was|were|has|have|had|did|occurred|happened|involved|directed|coordinated|authorized|signed|funded|concealed|disclosed|recorded|reported|stated|revised|changed|completed|published|removed|confirmed)\s+(.+?)$/i
  );

  if (match) {
    return {
      subject: match[1]!.trim(),
      predicate: match[2]!.toLowerCase(),
      object: match[3]!.replace(/[.;:]$/, "").trim(),
    };
  }

  return {
    subject: normalized.split(" ").slice(0, 4).join(" ") || null,
    predicate: ASSERTION.exec(normalized)?.[0]?.toLowerCase() ?? "states",
    object: normalized,
  };
}

function confidenceFor(sentence: string, modality: ExtractionCandidate["modality"]): number {
  let score = sentence.length > 80 ? 0.78 : 0.65;
  if (modality === "asserted_fact") score += 0.1;
  if (modality === "allegation") score -= 0.12;
  if (modality === "opinion") score -= 0.22;
  if (NEGATION.test(sentence)) score -= 0.03;
  return Math.max(0.25, Math.min(0.95, score));
}

export function extractClaimCandidatesFromChunk(chunk: DocumentChunk): ExtractionCandidate[] {
  const sentences = splitSentences(chunk.text);

  return sentences
    .filter((entry) => ASSERTION.test(entry.sentence))
    .map((entry, index) => {
      const modality = inferModality(entry.sentence);
      const spo = extractSPO(entry.sentence);
      const charStart = chunk.charStart + entry.start;
      const charEnd = chunk.charStart + entry.end;

      return {
        id: stableId("cand", `${chunk.id}:${index}:${entry.sentence}`),
        sentence: entry.sentence,
        sentenceIndex: index,
        chunkIndex: chunk.chunkIndex,
        subject: spo.subject,
        predicate: spo.predicate,
        object: spo.object,
        polarity: NEGATION.test(entry.sentence) ? "denied" : "affirmed",
        modality,
        confidence: confidenceFor(entry.sentence, modality),
        charStart,
        charEnd,
      };
    });
}

export function candidateToClaim(candidate: ExtractionCandidate, publicImpact = false): Claim {
  const fingerprint = stableId(
    "clm",
    `${candidate.subject ?? ""}|${candidate.predicate}|${candidate.object ?? ""}|${candidate.polarity}`.toLowerCase()
  );

  return {
    id: fingerprint,
    claimText: candidate.sentence,
    subject: candidate.subject,
    predicate: candidate.predicate,
    object: candidate.object,
    polarity: candidate.polarity,
    modality: candidate.modality,
    canonicalFingerprint: fingerprint,
    publicImpact,
  };
}
