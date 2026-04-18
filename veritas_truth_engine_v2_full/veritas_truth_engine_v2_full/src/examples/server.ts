
import http from "node:http";
import { sampleInput } from "./sample-input.js";
import { InMemoryTruthEngineRepository } from "../lib/repository.js";
import { TruthEngineService } from "../lib/service.js";

const repo = new InMemoryTruthEngineRepository();
const service = new TruthEngineService(repo);

const html = (body: string) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Veritas Truth Engine v2 Demo</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; line-height: 1.5; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    pre { background: #f7f7f7; padding: 12px; border-radius: 8px; overflow: auto; }
    .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #111; color: #fff; }
  </style>
</head>
<body>${body}</body></html>`;

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400); res.end("Bad request"); return;
  }

  if (req.url === "/api/assess") {
    const result = await service.assessAndPersist(sampleInput);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result, null, 2));
    return;
  }

  const result = await service.assessAndPersist(sampleInput);
  const body = `
    <h1>Veritas Truth Engine v2 Demo</h1>
    <p>Claim-centric adjudication demo for ChronoScope-style historical analysis.</p>
    <div class="card">
      <h2>Claim</h2>
      <p>${sampleInput.claim.claimText}</p>
      <p><span class="pill">${result.truthState}</span></p>
      <p><strong>Truth score:</strong> ${result.truthScore.toFixed(4)}</p>
      <p><strong>Release decision:</strong> ${result.releaseDecision}</p>
      <p><strong>Review reasons:</strong> ${result.reviewReasons.join(", ") || "none"}</p>
    </div>
    <div class="card">
      <h2>Feature vector</h2>
      <pre>${JSON.stringify(result.features, null, 2)}</pre>
    </div>
    <div class="card">
      <h2>Full assessment</h2>
      <pre>${JSON.stringify(result, null, 2)}</pre>
    </div>
    <p>JSON endpoint: <a href="/api/assess">/api/assess</a></p>
  `;
  res.writeHead(200, { "content-type": "text/html" });
  res.end(html(body));
});

server.listen(3017, () => {
  console.log("Demo server running at http://localhost:3017");
});
