import crypto from "crypto";
import { Claim } from "../core/types";
import { DocumentChunk, ExtractionCandidate } from "../ingest/types";

const MODALITY_PATTERNS = {
  allegation: /(alleged|allegedly|reportedly|is said to|claims? that)/i,
  opinion: /(i think|in my view|arguably|appears to)/i,
  quote: /^\s*["“]/,
  forecast: /(will|would|could|may|might)/i,
};

const NEGATION = /(no|not|never|none|without|did not|was not|were not|is not|are not|denied)/i;
const ASSERTION = /(is|are|was|were|has|have|had|did|occurred|happened|involved|directed|coordinated|authorized|signed|funded|concealed|disclosed|recorded|reported|stated)/i;

function splitSentences(text: string): Array<{ sentence: string; start: number; end: number }> {
  const out: Array<{ sentence: string; start: number; end: number }> = [];
  const regex = /[^.!?
]+[.!?]?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const sentence = match[0].trim();
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
  const m = normalized.match(/^([A-Z][A-Za-z0-9,'\-() ]{1,80}?)\s+(is|are|was|were|has|have|had|did|occurred|happened|involved|directed|coordinated|authorized|signed|funded|concealed|disclosed|recorded|reported|stated)\s+(.+?)$/i);
  if (m) {
    return {
      subject: m[1].trim(),
      predicate: m[2].toLowerCase(),
      object: m[3].replace(/[.;:]$/, "").trim(),
    };
  }
  return {
    subject: normalized.split(" ").slice(0, 3).join(" ") || null,
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
    .filter((s) => ASSERTION.test(s.sentence))
    .map((s, idx) => {
      const modality = inferModality(s.sentence);
      const spo = extractSPO(s.sentence);
      return {
        sentence: s.sentence,
        sentenceIndex: idx,
        subject: spo.subject,
        predicate: spo.predicate,
        object: spo.object,
        polarity: NEGATION.test(s.sentence) ? "denied" : "affirmed",
        modality,
        confidence: confidenceFor(s.sentence, modality),
        charStart: chunk.charStart + s.start,
        charEnd: chunk.charStart + s.end,
      };
    });
}

export function candidateToClaim(candidate: ExtractionCandidate): Claim {
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${candidate.subject ?? ""}|${candidate.predicate}|${candidate.object ?? ""}|${candidate.polarity}`.toLowerCase())
    .digest("hex");

  return {
    id: fingerprint,
    claimText: candidate.sentence,
    predicate: candidate.predicate,
    objectLiteral: candidate.object,
    polarity: candidate.polarity,
    modality: candidate.modality,
    canonicalFingerprint: fingerprint,
  } as Claim;
}
