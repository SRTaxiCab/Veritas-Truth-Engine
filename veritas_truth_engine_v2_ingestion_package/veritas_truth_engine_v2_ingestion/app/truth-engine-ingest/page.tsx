export default function TruthEngineIngestPage() {
  return (
    <main style={{ fontFamily: "Inter, Arial, sans-serif", padding: 24 }}>
      <h1>Truth Engine v2 — Ingestion Demo</h1>
      <p>
        POST raw text or a local file path to <code>/api/ingest-document</code> to ingest, extract
        claims, derive contradictions/support relations, and score the resulting claims.
      </p>
      <pre style={{ background: "#111", color: "#eaeaea", padding: 16, borderRadius: 12 }}>
{`{
  "title": "Archive Memo",
  "text": "The committee report states the incident occurred in 1962. Another witness denied the event happened in 1962.",
  "sourceType": "archive_memo",
  "origin": "ChronoScope demo"
}`}
      </pre>
    </main>
  );
}
