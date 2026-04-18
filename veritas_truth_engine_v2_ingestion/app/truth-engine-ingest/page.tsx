"use client";

import React, { useState } from "react";

export default function TruthEngineIngestPage() {
  const [title, setTitle] = useState("Historical Record");
  const [content, setContent] = useState("In 1912 the local board reported that the site was completed. A later report stated the site was not completed until 1913.");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await fetch("/api/ingest-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, mimeType: "text/plain" }),
    });
    const json = await res.json();
    setResult(json);
    setLoading(false);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Truth Engine Ingestion Demo</h1>
      <input className="w-full border rounded p-2" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="w-full border rounded p-3 h-56" value={content} onChange={(e) => setContent(e.target.value)} />
      <button className="px-4 py-2 rounded bg-black text-white" onClick={submit} disabled={loading}>
        {loading ? "Assessing..." : "Ingest and Assess"}
      </button>
      {result && <pre className="bg-neutral-100 p-4 rounded overflow-auto text-sm">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
