const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "and",
  "to",
  "in",
  "on",
  "at",
  "from",
  "by"
]);

export function normalizeEntityText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[“”"'.:,;()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token))
    .join(" ");
}

export function canonicalDisplayName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part)
    .join(" ");
}

export function tokenizeEntity(input: string): string[] {
  return normalizeEntityText(input).split(" ").filter(Boolean);
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenizeEntity(a));
  const setB = new Set(tokenizeEntity(b));
  if (!setA.size && !setB.size) return 1;
  const intersection = [...setA].filter((value) => setB.has(value)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
