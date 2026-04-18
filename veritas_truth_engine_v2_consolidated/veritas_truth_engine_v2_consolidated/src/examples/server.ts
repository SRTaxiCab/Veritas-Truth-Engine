import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assessClaimHandler } from "../api/assess-claim.js";
import {
  auditLogHandler,
  createTenantHandler,
  createUserHandler,
  enterpriseAdminStateHandler,
  switchTenantHandler,
} from "../api/enterprise-admin.js";
import { exportDossierHandler, buildDossierPreview } from "../api/export-dossier.js";
import { exportLiveReport } from "../api/export-report.js";
import { getClaimGraphPayload } from "../api/graph.js";
import { getJobHandler, ingestDocumentHandler, ingestDocumentJobHandler, listIngestionHistoryHandler, listJobsHandler } from "../api/ingest-document.js";
import { applyReviewActionHandler, buildDemoReviewerWorkspace } from "../api/reviewer-workspace.js";
import { repositoryDiagnostics } from "../lib/enterprise-repository-factory.js";
import { sampleInput } from "./sample-input.js";

const PORT = Number(process.env.PORT ?? 3017);
const ROOT_DIR = process.cwd();
const MAX_BODY_BYTES = Number(process.env.VERITAS_MAX_BODY_BYTES ?? 1_000_000);
const API_KEY = process.env.VERITAS_API_KEY;
const LOG_LEVEL = process.env.VERITAS_LOG_LEVEL ?? "info";
const SERVER_STARTED_AT = Date.now();
const DOWNLOADS = {
  operationsManualMarkdown: path.join(ROOT_DIR, "docs", "veritas_operations_manual.md"),
  operationsManualPdf: path.join(ROOT_DIR, "docs", "veritas_operations_manual.pdf"),
};
const ASSETS = {
  veritasLogo: path.join(ROOT_DIR, "public", "assets", "veritas-systems-logo.png"),
  truthEngineLogo: path.join(ROOT_DIR, "public", "assets", "veritas-truth-engine-logo.png"),
};

type RequestContext = {
  requestId: string;
  startedAt: number;
  method: string;
  pathname: string;
};

function securityHeaders(extra: Record<string, string> = {}, requestId?: string): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    ...(requestId ? { "x-request-id": requestId } : {}),
    ...extra,
  };
}

function logRequest(ctx: RequestContext, status: number, extra: Record<string, unknown> = {}): void {
  if (LOG_LEVEL === "silent") return;
  const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  console.log(
    JSON.stringify({
      level,
      event: "http.request",
      requestId: ctx.requestId,
      method: ctx.method,
      path: ctx.pathname,
      status,
      durationMs: Date.now() - ctx.startedAt,
      ...extra,
    })
  );
}

function sendJson(res: any, body: unknown, status = 200, ctx?: RequestContext): void {
  res.writeHead(status, securityHeaders({ "content-type": "application/json; charset=utf-8" }, ctx?.requestId));
  res.end(JSON.stringify(body, null, 2));
  if (ctx) logRequest(ctx, status);
}

function sendDownload(res: any, filePath: string, filename: string, contentType: string, ctx?: RequestContext): void {
  if (!fs.existsSync(filePath)) {
    sendJson(res, { ok: false, error: `${filename} is not available yet.` }, 404, ctx);
    return;
  }

  res.writeHead(200, securityHeaders({
    "content-type": contentType,
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
  }, ctx?.requestId));
  if (ctx) logRequest(ctx, 200, { file: filename });
  fs.createReadStream(filePath).pipe(res);
}

function sendAsset(res: any, filePath: string, contentType: string, ctx?: RequestContext): void {
  if (!fs.existsSync(filePath)) {
    sendJson(res, { ok: false, error: "Asset not found." }, 404, ctx);
    return;
  }

  res.writeHead(200, securityHeaders({
    "content-type": contentType,
    "cache-control": "public, max-age=86400",
  }, ctx?.requestId));
  if (ctx) logRequest(ctx, 200, { asset: path.basename(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

function methodAllowed(req: any, res: any, methods: string[], ctx?: RequestContext): boolean {
  if (methods.includes(req.method)) return true;
  res.writeHead(405, securityHeaders({ allow: methods.join(", "), "content-type": "application/json; charset=utf-8" }, ctx?.requestId));
  res.end(JSON.stringify({ ok: false, error: `Method ${req.method} is not allowed.` }, null, 2));
  if (ctx) logRequest(ctx, 405);
  return false;
}

function apiKeyAllowed(req: any, res: any, pathname: string, ctx?: RequestContext): boolean {
  const publicPaths = new Set(["/", "/index.html", "/favicon.ico", "/healthz", "/readyz"]);
  if (!API_KEY || publicPaths.has(pathname) || pathname.startsWith("/downloads/") || pathname.startsWith("/assets/")) return true;
  const supplied = req.headers["x-veritas-api-key"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (supplied === API_KEY) return true;
  sendJson(res, { ok: false, error: "Unauthorized." }, 401, ctx);
  return false;
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer | string) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error(`Request body too large. Limit is ${MAX_BODY_BYTES} bytes.`));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function parseAssessmentPayload(req: any) {
  if (req.method !== "POST") return sampleInput;
  const raw = await readBody(req);
  if (!raw.trim()) return sampleInput;
  return JSON.parse(raw);
}

async function parseJsonPayload(req: any) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

const appHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Veritas Truth Engine</title>
  <style>
    :root {
      --ink: #171717;
      --muted: #64615b;
      --paper: #f6f3ed;
      --surface: #fffcf5;
      --line: #d8d0c1;
      --teal: #09716d;
      --red: #a93a35;
      --gold: #b7811d;
      --green: #17734d;
      --black: #10100f;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--paper);
      color: var(--ink);
      letter-spacing: 0;
    }

    button, textarea, input, select { font: inherit; }
    a { color: inherit; }

    .hero {
      min-height: 92svh;
      display: grid;
      grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.1fr);
      border-bottom: 1px solid var(--line);
      background:
        linear-gradient(90deg, rgba(16,16,15,0.88), rgba(16,16,15,0.52) 42%, rgba(16,16,15,0.1)),
        url("https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1800&q=80") center / cover;
      color: #fffaf0;
    }

    .hero-copy {
      align-self: end;
      padding: 44px;
      max-width: 760px;
      animation: rise 560ms ease-out both;
    }

    .eyebrow {
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.12em;
      color: #e7c777;
      margin: 0 0 18px;
      font-weight: 700;
    }

    .hero-logo {
      width: min(3120px, 112vw);
      max-height: 68svh;
      object-fit: contain;
      height: auto;
      display: block;
      margin: 0 0 24px -32px;
      filter: drop-shadow(0 18px 34px rgba(0,0,0,0.34));
    }

    h1 {
      margin: 0;
      font-size: clamp(44px, 8vw, 116px);
      line-height: 0.92;
      letter-spacing: 0;
      max-width: 8ch;
    }

    .hero-copy p {
      max-width: 610px;
      margin: 24px 0 0;
      font-size: 18px;
      line-height: 1.55;
      color: #f2ead9;
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 30px;
    }

    .button {
      border: 1px solid rgba(255,255,255,0.42);
      background: #fffaf0;
      color: var(--black);
      border-radius: 8px;
      padding: 12px 16px;
      cursor: pointer;
      transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
      text-decoration: none;
      font-weight: 700;
    }

    .button.secondary {
      background: rgba(16,16,15,0.28);
      color: #fffaf0;
    }

    .button:hover { transform: translateY(-2px); }

    .hero-panel {
      align-self: end;
      padding: 44px;
      display: grid;
      gap: 14px;
      animation: rise 720ms ease-out 120ms both;
    }

    .doctrine-line {
      display: grid;
      grid-template-columns: 78px 1fr;
      gap: 16px;
      align-items: start;
      padding: 16px 0;
      border-top: 1px solid rgba(255,255,255,0.28);
      max-width: 660px;
    }

    .doctrine-line strong {
      color: #e7c777;
      font-size: 13px;
      text-transform: uppercase;
    }

    .doctrine-line span {
      color: #fbf4e5;
      line-height: 1.45;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 14px 28px 14px 8px;
      background: rgba(246,243,237,0.92);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--line);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
    }

    .brand-logo {
      width: 168px;
      height: 42px;
      object-fit: contain;
      display: block;
    }

    nav {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    nav a {
      text-decoration: none;
      color: var(--muted);
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 14px;
    }

    nav a:hover { background: #ebe4d8; color: var(--ink); }

    .section {
      padding: 56px 28px;
      border-bottom: 1px solid var(--line);
    }

    .inner {
      max-width: 1280px;
      margin: 0 auto;
    }

    .section-heading {
      display: grid;
      grid-template-columns: minmax(260px, 0.8fr) minmax(320px, 1.2fr);
      gap: 32px;
      align-items: end;
      margin-bottom: 28px;
    }

    h2 {
      margin: 0;
      font-size: clamp(30px, 4vw, 56px);
      line-height: 1;
      letter-spacing: 0;
    }

    .section-heading p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: 16px;
    }

    .pipeline {
      display: grid;
      grid-template-columns: repeat(7, minmax(128px, 1fr));
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 8px;
    }

    .stage {
      min-height: 150px;
      border-left: 3px solid var(--teal);
      background: var(--surface);
      padding: 14px;
      border-radius: 8px;
      box-shadow: 0 1px 0 rgba(16,16,15,0.08);
      transition: transform 180ms ease, border-color 180ms ease;
    }

    .stage:nth-child(2n) { border-left-color: var(--gold); }
    .stage:nth-child(3n) { border-left-color: var(--red); }
    .stage:hover { transform: translateY(-4px); }
    .stage b { display: block; margin-bottom: 10px; }
    .stage span { color: var(--muted); font-size: 13px; line-height: 1.45; }

    .workspace {
      display: grid;
      grid-template-columns: minmax(320px, 0.82fr) minmax(400px, 1.18fr);
      gap: 22px;
      align-items: start;
    }

    .panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
    }

    .panel h3 {
      margin: 0 0 12px;
      font-size: 20px;
    }

    textarea {
      width: 100%;
      min-height: 430px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #fffaf3;
      color: var(--ink);
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
    }

    input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 11px 12px;
      background: #fffaf3;
      color: var(--ink);
    }

    input[type="checkbox"] {
      width: auto;
      accent-color: var(--teal);
    }

    input[type="file"] {
      padding: 10px;
      background: #fff;
    }

    label {
      display: grid;
      gap: 7px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 210px;
      gap: 12px;
      margin-bottom: 12px;
    }

    .compact-textarea {
      min-height: 240px;
    }

    .claim-list {
      display: grid;
      gap: 10px;
      margin-top: 14px;
      max-height: 480px;
      overflow: auto;
    }

    .claim-item {
      text-align: left;
      width: 100%;
      border: 1px solid var(--line);
      border-left: 4px solid var(--teal);
      border-radius: 8px;
      padding: 12px;
      background: #fffaf3;
      color: var(--ink);
      cursor: pointer;
      transition: transform 160ms ease, border-color 160ms ease;
    }

    .claim-item:hover {
      transform: translateY(-2px);
      border-left-color: var(--gold);
    }

    .claim-item small {
      color: var(--muted);
      display: block;
      margin-top: 7px;
    }

    .history-list {
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }

    .history-item {
      border-top: 1px solid var(--line);
      padding-top: 12px;
      display: grid;
      gap: 5px;
    }

    .task-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .mini-button {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--ink);
      padding: 7px 9px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 800;
    }

    .mini-button:hover {
      border-color: var(--teal);
    }

    .admin-grid {
      display: grid;
      grid-template-columns: minmax(300px, 0.9fr) minmax(420px, 1.1fr);
      gap: 18px;
      align-items: start;
    }

    .audit-list {
      display: grid;
      gap: 10px;
      max-height: 520px;
      overflow: auto;
    }

    .audit-item {
      border-left: 4px solid var(--teal);
      background: #fffaf3;
      border-radius: 8px;
      padding: 12px;
      border-top: 1px solid var(--line);
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }

    .audit-item small {
      color: var(--muted);
      display: block;
      margin-top: 6px;
    }

    .job-item {
      border: 1px solid var(--line);
      border-left: 4px solid var(--gold);
      border-radius: 8px;
      padding: 12px;
      background: #fffaf3;
      display: grid;
      gap: 8px;
    }

    .job-item.completed { border-left-color: var(--green); }
    .job-item.failed { border-left-color: var(--red); }
    .job-item.running, .job-item.queued { border-left-color: var(--teal); }

    .progress {
      height: 8px;
      background: #e4dccd;
      border-radius: 999px;
      overflow: hidden;
    }

    .progress i {
      display: block;
      height: 100%;
      width: var(--value);
      background: linear-gradient(90deg, var(--teal), var(--gold));
    }

    .result-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 14px;
    }

    .metric {
      border-top: 3px solid var(--teal);
      background: #fffaf3;
      border-radius: 8px;
      padding: 14px;
    }

    .metric:nth-child(2) { border-top-color: var(--gold); }
    .metric:nth-child(3) { border-top-color: var(--red); }
    .metric span {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 800;
    }
    .metric strong {
      display: block;
      margin-top: 8px;
      font-size: 26px;
    }

    .features {
      display: grid;
      gap: 12px;
      margin-top: 18px;
    }

    .feature-row {
      display: grid;
      grid-template-columns: 210px 1fr 48px;
      gap: 12px;
      align-items: center;
      font-size: 13px;
    }

    .bar {
      height: 10px;
      border-radius: 999px;
      background: #e4dccd;
      overflow: hidden;
    }

    .bar i {
      display: block;
      height: 100%;
      width: var(--value);
      background: linear-gradient(90deg, var(--teal), var(--gold));
      border-radius: 999px;
      transition: width 280ms ease;
    }

    .evidence-list, .timeline, .review-lanes {
      display: grid;
      gap: 12px;
    }

    .evidence-item {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 14px;
      padding: 14px 0;
      border-top: 1px solid var(--line);
    }

    .tag {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 5px 9px;
      background: #e8efe7;
      color: var(--green);
      font-size: 12px;
      font-weight: 800;
    }

    .tag.contradicting { background: #f5e2dc; color: var(--red); }
    .tag.contextual { background: #f3ebd1; color: #80580c; }

    .graph-wrap {
      min-height: 460px;
      display: grid;
      grid-template-columns: 1fr 260px;
      gap: 18px;
      align-items: stretch;
    }

    .graph-canvas {
      position: relative;
      min-height: 430px;
      border: 1px solid var(--line);
      background:
        linear-gradient(rgba(23,23,23,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(23,23,23,0.04) 1px, transparent 1px),
        #fffaf3;
      background-size: 34px 34px;
      border-radius: 8px;
      overflow: hidden;
    }

    .graph-line {
      position: absolute;
      height: 2px;
      background: var(--line);
      transform-origin: left center;
    }

    .node {
      position: absolute;
      width: 150px;
      min-height: 54px;
      padding: 10px;
      border-radius: 8px;
      background: #fff;
      border: 1px solid var(--line);
      box-shadow: 0 8px 24px rgba(16,16,15,0.08);
      font-size: 12px;
      line-height: 1.25;
      transition: transform 180ms ease;
    }

    .node:hover { transform: scale(1.03); }
    .node.claim { border-top: 4px solid var(--teal); }
    .node.source { border-top: 4px solid var(--gold); }
    .node.entity { border-top: 4px solid var(--red); }

    .timeline-item {
      border-left: 3px solid var(--teal);
      padding: 0 0 12px 14px;
      color: var(--muted);
      font-size: 13px;
    }

    .timeline-item strong {
      display: block;
      color: var(--ink);
      margin-bottom: 5px;
    }

    .lanes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }

    .lane h3 {
      margin: 0 0 10px;
    }

    .task {
      padding: 12px;
      border-radius: 8px;
      background: #fffaf3;
      border: 1px solid var(--line);
      margin-bottom: 10px;
    }

    .task small {
      color: var(--muted);
      font-weight: 800;
      text-transform: uppercase;
    }

    .task b {
      display: block;
      margin: 6px 0;
    }

    .dossier-grid {
      display: grid;
      grid-template-columns: minmax(320px, 0.9fr) minmax(380px, 1.1fr);
      gap: 18px;
    }

    .mono {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 420px;
      overflow: auto;
    }

    footer {
      padding: 34px 28px;
      color: var(--muted);
      background: var(--black);
    }

    footer .inner {
      color: #f5efe2;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 920px) {
      .hero, .workspace, .section-heading, .graph-wrap, .dossier-grid, .admin-grid {
        grid-template-columns: 1fr;
      }

      .hero {
        min-height: auto;
      }

      .hero-copy, .hero-panel {
        padding: 30px 22px;
      }

      .result-grid, .lanes {
        grid-template-columns: 1fr;
      }

      .form-grid {
        grid-template-columns: 1fr;
      }

      .feature-row {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <section class="hero" id="top">
    <div class="hero-copy">
      <img class="hero-logo" src="/assets/veritas-systems-logo.png" alt="Veritas Systems" />
      <p class="eyebrow">Root dependency for verified systems</p>
      <h1>Veritas Truth Engine</h1>
      <p>No output exists without traceable truth validation. Every claim is bound to evidence, scored with uncertainty, linked to provenance, and gated before release.</p>
      <div class="hero-actions">
        <a class="button" href="#assess">Assess a claim</a>
        <a class="button secondary" href="#ingest">Ingest a document</a>
      </div>
    </div>
    <div class="hero-panel" aria-label="Truth Engine operating doctrine">
      <div class="doctrine-line"><strong>01</strong><span>No claim without evidence spans and source fingerprints.</span></div>
      <div class="doctrine-line"><strong>02</strong><span>No analysis without provenance, lineage, and version history.</span></div>
      <div class="doctrine-line"><strong>03</strong><span>No prediction without probabilistic scoring and uncertainty bands.</span></div>
      <div class="doctrine-line"><strong>04</strong><span>No visualization without source linkage and release gating.</span></div>
    </div>
  </section>

  <header class="topbar">
    <div class="brand"><img class="brand-logo" src="/assets/veritas-systems-logo.png" alt="Veritas Systems" /></div>
    <nav>
      <a href="#pipeline">Pipeline</a>
      <a href="#ingest">Ingest</a>
      <a href="#assess">Assessment</a>
      <a href="#graph">Graph</a>
      <a href="#review">Review</a>
      <a href="#dossier">Dossier</a>
      <a href="#enterprise">Enterprise</a>
    </nav>
  </header>

  <section class="section" id="pipeline">
    <div class="inner">
      <div class="section-heading">
        <h2>Truth validation as a system constraint.</h2>
        <p>The PDF brief defines Veritas as a multi-layer enforcement pipeline: ingest, extract, bind, compare, score, graph, and gate. This workspace exposes those layers as one operating surface.</p>
      </div>
      <div class="pipeline">
        <div class="stage"><b>Ingestion</b><span>Raw PDFs, OSINT feeds, archives, OCR, parsing, metadata, and source fingerprinting.</span></div>
        <div class="stage"><b>Claim Extraction</b><span>Unstructured inputs become atomic propositions with confidence and model lineage.</span></div>
        <div class="stage"><b>Evidence Binding</b><span>Claims map to exact spans, source versions, offsets, quotes, and span hashes.</span></div>
        <div class="stage"><b>Contradiction</b><span>Claims are compared for conflict, omission, convergence, and narrative drift.</span></div>
        <div class="stage"><b>WEAPR Scoring</b><span>Weighted evidence, provenance integrity, temporal coherence, and manipulation risk.</span></div>
        <div class="stage"><b>Provenance Graph</b><span>Claim to evidence to source to origin, graph-ready for audit and review.</span></div>
        <div class="stage"><b>Output Gate</b><span>Auto-release, review-required, or hold based on evidence and risk thresholds.</span></div>
      </div>
    </div>
  </section>

  <section class="section" id="ingest">
    <div class="inner">
      <div class="section-heading">
        <h2>Ingest documents into claim packages.</h2>
        <p>Paste source text or upload a text, markdown, JSON, or PDF file. Veritas parses the document, chunks it, extracts atomic claims, binds each claim to an evidence span, and scores each package.</p>
      </div>
      <div class="workspace">
        <div class="panel">
          <h3>Document Input</h3>
          <div class="form-grid">
            <label>Title
              <input id="docTitle" value="Historical Record Packet" />
            </label>
            <label>Type
              <select id="docMime">
                <option value="text/plain">Text</option>
                <option value="text/markdown">Markdown</option>
                <option value="application/json">JSON</option>
                <option value="application/pdf">PDF upload</option>
              </select>
            </label>
          </div>
          <label>Upload file
            <input id="docFile" type="file" accept=".txt,.md,.json,.pdf,text/plain,text/markdown,application/json,application/pdf" />
          </label>
          <div style="height:12px"></div>
          <label>Document text
            <textarea id="docContent" class="compact-textarea">In 1912 the local board reported that the archive site was completed. A later engineering memorandum stated the site was not completed until 1913. The public notice removed references to the delayed completion after the internal memorandum was circulated.</textarea>
          </label>
          <div class="hero-actions">
            <button class="button" id="ingestRun">Ingest document</button>
            <label style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:8px;font-weight:700;color:var(--ink)">
              <input id="docPublicImpact" type="checkbox" checked />
              public-impact review gate
            </label>
          </div>
        </div>
        <div class="panel">
          <h3>Extracted Claims</h3>
          <div class="result-grid">
            <div class="metric"><span>Chunks</span><strong id="chunkCount">--</strong></div>
            <div class="metric"><span>Claims</span><strong id="claimCount">--</strong></div>
            <div class="metric"><span>Reviews</span><strong id="ingestReviewCount">--</strong></div>
          </div>
          <div id="ingestSummary" class="mono" style="max-height:150px"></div>
          <div id="claimList" class="claim-list"></div>
          <h3 style="margin-top:24px">Saved Ingestions</h3>
          <div id="historyList" class="history-list"></div>
          <h3 style="margin-top:24px">Processing Jobs</h3>
          <div id="jobList" class="history-list"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="assess">
    <div class="inner">
      <div class="section-heading">
        <h2>Run the adjudicator.</h2>
        <p>Edit the claim package or use the seeded historical sample. The app posts directly to the local Truth Engine API and renders score, state, release gate, features, and evidence.</p>
      </div>
      <div class="workspace">
        <div class="panel">
          <h3>Claim Package JSON</h3>
          <textarea id="payload"></textarea>
          <div class="hero-actions">
            <button class="button" id="run">Assess claim</button>
            <button class="button secondary" id="reset">Reset sample</button>
          </div>
        </div>
        <div class="panel">
          <h3>Assessment</h3>
          <div class="result-grid">
            <div class="metric"><span>Truth score</span><strong id="truthScore">--</strong></div>
            <div class="metric"><span>Truth state</span><strong id="truthState">--</strong></div>
            <div class="metric"><span>Release gate</span><strong id="releaseState">--</strong></div>
          </div>
          <div id="features" class="features"></div>
          <h3 style="margin-top:24px">Evidence Binding</h3>
          <div id="evidence" class="evidence-list"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="graph">
    <div class="inner">
      <div class="section-heading">
        <h2>Audit the provenance graph.</h2>
        <p>The graph links the assessed claim to entities and sources. Contradicting edges stay visible so support cannot hide unresolved conflict.</p>
      </div>
      <div class="graph-wrap">
        <div id="graphCanvas" class="graph-canvas"></div>
        <div class="panel">
          <h3>Timeline</h3>
          <div id="timeline" class="timeline"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="review">
    <div class="inner">
      <div class="section-heading">
        <h2>Human review before release.</h2>
        <p>Ambiguous entity resolution, contradiction pressure, weak provenance, and public-impact claims are routed here before any downstream system can rely on them.</p>
      </div>
      <div class="lanes">
        <div class="panel lane"><h3>Open</h3><div id="openTasks"></div></div>
        <div class="panel lane"><h3>In Review</h3><div id="inReviewTasks"></div></div>
        <div class="panel lane"><h3>Resolved</h3><div id="resolvedTasks"></div></div>
      </div>
    </div>
  </section>

  <section class="section" id="dossier">
    <div class="inner">
      <div class="section-heading">
        <h2>Export-ready evidence dossier.</h2>
        <p>The dossier layer packages assessed claims, release recommendations, chain-of-custody notes, and provenance paths for review or publication workflows.</p>
      </div>
      <div class="dossier-grid">
        <div class="panel">
          <h3>Dossier Preview</h3>
          <div id="dossierSummary"></div>
          <div class="hero-actions">
            <button class="button" id="exportDossier">Generate PDF artifact</button>
          </div>
          <h3 style="margin-top:24px">Operations Manual</h3>
          <p>Download the operating runbook for ingestion, review, export, tenant administration, monitoring, backup, and incident response.</p>
          <div class="hero-actions">
            <a class="button" href="/downloads/veritas-operations-manual.pdf">Download PDF manual</a>
            <a class="button secondary" href="/downloads/veritas-operations-manual.md">Download Markdown</a>
          </div>
          <h3 style="margin-top:24px">Live Report Export</h3>
          <div class="hero-actions">
            <button class="button secondary" data-report-format="markdown">Markdown</button>
            <button class="button secondary" data-report-format="html">HTML</button>
            <button class="button secondary" data-report-format="json">JSON</button>
          </div>
        </div>
        <div class="panel">
          <h3>API Response</h3>
          <div id="dossierRaw" class="mono"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="enterprise">
    <div class="inner">
      <div class="section-heading">
        <h2>Enterprise control plane.</h2>
        <p>Tenant isolation, role inventory, and immutable audit events are first-class surfaces. This is the operating layer enterprise buyers expect before production rollout.</p>
      </div>
      <div class="admin-grid">
        <div class="panel">
          <h3>Active Tenant</h3>
          <div class="form-grid" style="margin-bottom:14px">
            <label>API key
              <input id="apiKeyInput" type="password" placeholder="Required only when VERITAS_API_KEY is enabled" autocomplete="off" />
            </label>
            <label>Status
              <input id="apiKeyStatus" readonly value="Local unsecured mode" />
            </label>
          </div>
          <div class="hero-actions" style="margin-top:0;margin-bottom:14px">
            <button class="button secondary" id="saveApiKey">Save API key</button>
            <button class="button secondary" id="clearApiKey">Clear key</button>
          </div>
          <div id="repoDiagnostics" class="mono" style="max-height:150px;margin-bottom:14px"></div>
          <div id="tenantSummary" class="mono" style="max-height:180px"></div>
          <div class="form-grid" style="margin-top:14px">
            <label>Tenant
              <select id="tenantSelect"></select>
            </label>
            <label>New tenant
              <input id="tenantName" placeholder="Acme Intelligence Group" />
            </label>
          </div>
          <div class="hero-actions">
            <button class="button" id="switchTenant">Switch tenant</button>
            <button class="button secondary" id="createTenant">Create tenant</button>
          </div>
          <h3 style="margin-top:24px">Users</h3>
          <div id="userList" class="history-list"></div>
          <div class="form-grid" style="margin-top:14px">
            <label>Email
              <input id="userEmail" placeholder="reviewer@example.com" />
            </label>
            <label>Role
              <select id="userRole">
                <option value="analyst">Analyst</option>
                <option value="reviewer">Reviewer</option>
                <option value="auditor">Auditor</option>
                <option value="read_only">Read only</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <label>Display name
            <input id="userDisplayName" placeholder="Jordan Reviewer" />
          </label>
          <div class="hero-actions">
            <button class="button secondary" id="createUser">Add user</button>
          </div>
        </div>
        <div class="panel">
          <h3>Audit Trail</h3>
          <div id="auditList" class="audit-list"></div>
        </div>
      </div>
    </div>
  </section>

  <footer>
    <div class="inner">
      <strong>Veritas Systems does not generate information. It validates reality.</strong>
      <span>Local endpoints: /api/ingest-document-async, /api/jobs, /api/assess, /api/graph, /api/reviewer-workspace, /api/dossier-preview</span>
    </div>
  </footer>

  <script>
    const sampleInput = ${JSON.stringify(sampleInput, null, 2)};
    const apiKeyRequired = ${JSON.stringify(Boolean(API_KEY))};
    const payloadEl = document.getElementById("payload");
    const runButton = document.getElementById("run");
    const resetButton = document.getElementById("reset");
    const exportButton = document.getElementById("exportDossier");
    const ingestButton = document.getElementById("ingestRun");
    const docFile = document.getElementById("docFile");
    const docMime = document.getElementById("docMime");
    const docTitle = document.getElementById("docTitle");
    const docContent = document.getElementById("docContent");
    const docPublicImpact = document.getElementById("docPublicImpact");
    const tenantSelect = document.getElementById("tenantSelect");
    const switchTenantButton = document.getElementById("switchTenant");
    const createTenantButton = document.getElementById("createTenant");
    const createUserButton = document.getElementById("createUser");
    const apiKeyInput = document.getElementById("apiKeyInput");
    const apiKeyStatus = document.getElementById("apiKeyStatus");
    const saveApiKeyButton = document.getElementById("saveApiKey");
    const clearApiKeyButton = document.getElementById("clearApiKey");
    const API_KEY_STORAGE = "veritas.apiKey";

    payloadEl.value = JSON.stringify(sampleInput, null, 2);

    const titleCase = (value) => String(value).replaceAll("_", " ");
    const pct = (value) => Math.round(Number(value || 0) * 100);
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
    const safeClass = (value) => String(value ?? "").replace(/[^a-z0-9_-]/gi, "");

    const nativeInnerHtml = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");

    function sanitizeHtml(html) {
      const template = document.createElement("template");
      nativeInnerHtml?.set?.call(template, String(html ?? ""));
      template.content.querySelectorAll("script, iframe, object, embed").forEach((node) => node.remove());
      template.content.querySelectorAll("*").forEach((node) => {
        [...node.attributes].forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          const value = attribute.value.trim().toLowerCase();
          if (name.startsWith("on") || ((name === "href" || name === "src") && value.startsWith("javascript:"))) {
            node.removeAttribute(attribute.name);
          }
        });
      });
      return nativeInnerHtml?.get?.call(template) ?? "";
    }

    if (nativeInnerHtml?.set && nativeInnerHtml?.get) {
      Object.defineProperty(Element.prototype, "innerHTML", {
        get() {
          return nativeInnerHtml.get.call(this);
        },
        set(value) {
          nativeInnerHtml.set.call(this, sanitizeHtml(value));
        }
      });
    }

    function savedApiKey() {
      return localStorage.getItem(API_KEY_STORAGE) || "";
    }

    function updateApiKeyUi() {
      const key = savedApiKey();
      apiKeyInput.value = key;
      apiKeyStatus.value = key ? "API key saved for this browser" : apiKeyRequired ? "API key required" : "Local unsecured mode";
    }

    async function apiFetch(url, options = {}) {
      const key = savedApiKey();
      const headers = new Headers(options.headers || {});
      if (key) headers.set("x-veritas-api-key", key);
      const response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        apiKeyStatus.value = "API key required or invalid";
        throw new Error("API key required or invalid.");
      }
      return response;
    }

    function renderFeatures(features) {
      const target = document.getElementById("features");
      target.innerHTML = Object.entries(features).map(([key, value]) => \`
        <div class="feature-row">
          <strong>\${titleCase(key)}</strong>
          <span class="bar" style="--value:\${pct(value)}%"><i></i></span>
          <span>\${pct(value)}%</span>
        </div>
      \`).join("");
    }

    function renderEvidence(input) {
      const target = document.getElementById("evidence");
      target.innerHTML = input.evidence.map(({ span, source }) => \`
        <div class="evidence-item">
          <span class="tag \${safeClass(span.evidenceRole)}">\${escapeHtml(span.evidenceRole)}</span>
          <div>
            <strong>\${escapeHtml(source.title)}</strong>
            <p style="margin:6px 0;color:var(--muted)">\${escapeHtml(span.quotedText)}</p>
            <small>page \${span.pageNumber || "n/a"} · reliability \${pct(source.reliabilityPrior)}% · custody \${pct(source.chainOfCustodyScore)}%</small>
          </div>
        </div>
      \`).join("");
    }

    function renderAssessment(response, input) {
      const assessment = response.assessment || response.body?.assessment;
      document.getElementById("truthScore").textContent = assessment.posteriorTruthScore.toFixed(3);
      document.getElementById("truthState").textContent = titleCase(assessment.truthState);
      document.getElementById("releaseState").textContent = titleCase(assessment.releaseState);
      renderFeatures(assessment.features);
      renderEvidence(input);
    }

    function nodePosition(index, total, kind) {
      if (kind === "claim") return { x: 42, y: 46 };
      const radius = 148;
      const angle = ((index / Math.max(total - 1, 1)) * Math.PI * 1.35) - 0.25;
      return {
        x: 54 + Math.cos(angle) * radius + 190,
        y: 50 + Math.sin(angle) * radius + 150
      };
    }

    function renderGraph(payload) {
      const canvas = document.getElementById("graphCanvas");
      const nodes = payload.graph.nodes;
      const positions = {};
      const others = nodes.filter((node) => node.kind !== "claim");
      nodes.forEach((node, index) => {
        positions[node.id] = nodePosition(others.findIndex((n) => n.id === node.id), others.length, node.kind);
      });

      const lines = payload.graph.edges.map((edge) => {
        const from = positions[edge.source] || { x: 70, y: 70 };
        const to = positions[edge.target] || { x: 360, y: 220 };
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const color = edge.type.includes("contradict") ? "var(--red)" : edge.type.includes("support") ? "var(--green)" : "var(--line)";
        return \`<span class="graph-line" style="left:\${from.x + 75}px;top:\${from.y + 28}px;width:\${length}px;transform:rotate(\${angle}deg);background:\${color};opacity:\${Math.max(edge.weight, 0.35)}"></span>\`;
      }).join("");

      const nodeHtml = nodes.map((node) => \`
        <div class="node \${node.kind}" style="left:\${positions[node.id].x}px;top:\${positions[node.id].y}px">
          <strong>\${escapeHtml(node.kind)}</strong><br />\${escapeHtml(String(node.label).slice(0, 92))}
        </div>
      \`).join("");
      canvas.innerHTML = lines + nodeHtml;

      document.getElementById("timeline").innerHTML = payload.timeline.map((event) => \`
        <div class="timeline-item">
          <strong>\${new Date(event.timestamp).toLocaleDateString()}</strong>
          \${escapeHtml(event.label)}
        </div>
      \`).join("");
    }

    function renderTasks(id, tasks) {
      document.getElementById(id).innerHTML = tasks.length ? tasks.map((task) => \`
        <div class="task">
          <small>\${task.type} · \${task.priority}</small>
          <b>\${task.title}</b>
          <span>\${task.summary}</span>
          <div class="task-actions">
            \${task.status === "open" ? \`<button class="mini-button" data-review="\${task.id}" data-decision="start_review">Start</button>\` : ""}
            \${task.status !== "resolved" ? \`
              <button class="mini-button" data-review="\${task.id}" data-decision="approved">Approve</button>
              <button class="mini-button" data-review="\${task.id}" data-decision="needs_changes">Needs changes</button>
              <button class="mini-button" data-review="\${task.id}" data-decision="rejected">Reject</button>
              <button class="mini-button" data-review="\${task.id}" data-decision="deferred">Defer</button>
            \` : ""}
          </div>
        </div>
      \`).join("") : '<div class="task"><span>No tasks in this lane.</span></div>';
    }

    function renderReviewer(snapshot) {
      renderTasks("openTasks", snapshot.openTasks || []);
      renderTasks("inReviewTasks", snapshot.inReviewTasks || []);
      renderTasks("resolvedTasks", snapshot.resolvedTasks || []);
      document.querySelectorAll("[data-review]").forEach((button) => {
        button.addEventListener("click", async () => {
          await applyReviewAction(button.getAttribute("data-review"), button.getAttribute("data-decision"));
        });
      });
    }

    function renderDossier(dossier) {
      document.getElementById("dossierSummary").innerHTML = \`
        <p><strong>\${dossier.metadata.title}</strong></p>
        <p>Release recommendation: <span class="tag contextual">\${dossier.releaseRecommendation}</span></p>
        <p>Records: \${dossier.records.length}</p>
        <ul>\${dossier.chainOfCustodyNotes.map((note) => \`<li>\${note}</li>\`).join("")}</ul>
      \`;
      document.getElementById("dossierRaw").textContent = JSON.stringify(dossier, null, 2);
    }

    function arrayBufferToBase64(buffer) {
      let binary = "";
      const bytes = new Uint8Array(buffer);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    }

    function renderIngestResult(result) {
      document.getElementById("chunkCount").textContent = String(result.chunks.length);
      document.getElementById("claimCount").textContent = String(result.claimPackages.length);
      document.getElementById("ingestReviewCount").textContent = String(result.reviewCount);
      document.getElementById("ingestSummary").textContent = JSON.stringify({
        documentId: result.document.id,
        parser: result.document.parserName,
        contentHash: result.document.contentHash,
        sourceId: result.source.id,
        sourceVersionId: result.sourceVersion.id,
        relations: result.relations.length,
      }, null, 2);

      document.getElementById("claimList").innerHTML = result.claimPackages.length
        ? result.claimPackages.map((item, index) => \`
          <button class="claim-item" data-claim-index="\${index}">
            <strong>\${item.claim.claimText}</strong>
            <small>score \${item.assessment.posteriorTruthScore.toFixed(3)} · \${titleCase(item.assessment.truthState)} · \${titleCase(item.assessment.releaseState)} · confidence \${pct(item.candidate.confidence)}%</small>
          </button>
        \`).join("")
        : '<div class="task"><span>No atomic claims were extracted. Add declarative sentences with dates, actors, or actions.</span></div>';

      document.querySelectorAll("[data-claim-index]").forEach((button) => {
        button.addEventListener("click", async () => {
          const selected = result.claimPackages[Number(button.getAttribute("data-claim-index"))];
          payloadEl.value = JSON.stringify(selected.claimPackage, null, 2);
          location.hash = "#assess";
          await runAssessment();
        });
      });

      if (result.claimPackages[0]) {
        payloadEl.value = JSON.stringify(result.claimPackages[0].claimPackage, null, 2);
        runAssessment();
      }
      refreshHistory();
      refreshJobs();
      refreshReviewer();
      refreshDossier();
      refreshEnterprise();
    }

    function renderHistory(history) {
      const items = history.ingestions || [];
      document.getElementById("historyList").innerHTML = items.length ? items.map((item, index) => \`
        <div class="history-item">
          <strong>\${item.document.title}</strong>
          <span style="color:var(--muted);font-size:13px">\${new Date(item.createdAt).toLocaleString()} · \${item.claimCount} claim(s) · \${item.reviewCount} review gate(s)</span>
          <button class="mini-button" data-history-index="\${index}">Load first claim</button>
        </div>
      \`).join("") : '<div class="task"><span>No saved ingestions yet.</span></div>';

      document.querySelectorAll("[data-history-index]").forEach((button) => {
        button.addEventListener("click", async () => {
          const item = items[Number(button.getAttribute("data-history-index"))];
          const first = item?.claimPackages?.[0];
          if (!first) return;
          payloadEl.value = JSON.stringify(first.claimPackage, null, 2);
          location.hash = "#assess";
          await runAssessment();
        });
      });
    }

    function renderJobs(jobsPayload) {
      const jobs = jobsPayload.jobs || [];
      document.getElementById("jobList").innerHTML = jobs.length ? jobs.slice(0, 12).map((job) => \`
        <div class="job-item \${job.status}">
          <strong>\${job.title}</strong>
          <span style="color:var(--muted);font-size:13px">\${job.type} · \${job.status} · \${new Date(job.createdAt).toLocaleString()}</span>
          <span class="progress" style="--value:\${job.progress}%"><i></i></span>
          \${job.result ? \`<small>\${JSON.stringify(job.result)}</small>\` : ""}
          \${job.error ? \`<small style="color:var(--red)">\${job.error}</small>\` : ""}
        </div>
      \`).join("") : '<div class="task"><span>No processing jobs yet.</span></div>';
    }

    function renderEnterprise(state, audit, diagnostics) {
      document.getElementById("repoDiagnostics").textContent = JSON.stringify({
        repositoryMode: diagnostics.mode,
        configured: diagnostics.configured,
        databaseUrlPresent: diagnostics.databaseUrlPresent,
        requestedRepository: diagnostics.requestedRepository,
        error: diagnostics.error,
      }, null, 2);
      document.getElementById("tenantSummary").textContent = JSON.stringify({
        activeTenant: state.activeTenant,
        activeUser: state.activeUser,
        metrics: state.metrics,
      }, null, 2);

      tenantSelect.innerHTML = state.tenants.map((tenant) => \`
        <option value="\${tenant.id}" \${tenant.id === state.activeTenant.id ? "selected" : ""}>\${tenant.name} · \${tenant.region} · \${tenant.plan}</option>
      \`).join("");

      document.getElementById("userList").innerHTML = state.users.length ? state.users.map((user) => \`
        <div class="history-item">
          <strong>\${user.displayName}</strong>
          <span style="color:var(--muted);font-size:13px">\${user.email} · \${titleCase(user.role)} · \${user.status}</span>
        </div>
      \`).join("") : '<div class="task"><span>No users in this tenant.</span></div>';

      document.getElementById("auditList").innerHTML = (audit.auditLog || []).slice(0, 50).map((entry) => \`
        <div class="audit-item">
          <strong>\${entry.action}</strong>
          <span>\${entry.summary}</span>
          <small>\${new Date(entry.createdAt).toLocaleString()} · \${entry.actorEmail} · \${entry.resourceType}:\${entry.resourceId}</small>
        </div>
      \`).join("") || '<div class="task"><span>No audit events yet.</span></div>';
    }

    async function refreshEnterprise() {
      const [state, audit, diagnostics] = await Promise.all([
        apiFetch("/api/enterprise-state").then((res) => res.json()),
        apiFetch("/api/audit-log").then((res) => res.json()),
        apiFetch("/api/repository-diagnostics").then((res) => res.json()),
      ]);
      renderEnterprise(state, audit, diagnostics);
    }

    async function refreshHistory() {
      const history = await apiFetch("/api/ingestion-history").then((res) => res.json());
      renderHistory(history);
    }

    async function refreshJobs() {
      const jobs = await apiFetch("/api/jobs").then((res) => res.json());
      renderJobs(jobs);
    }

    async function refreshReviewer() {
      const reviewer = await apiFetch("/api/reviewer-workspace").then((res) => res.json());
      renderReviewer(reviewer);
    }

    async function refreshDossier() {
      const dossier = await apiFetch("/api/dossier-preview").then((res) => res.json());
      renderDossier(dossier);
    }

    async function applyReviewAction(taskId, decision) {
      const result = await apiFetch("/api/review-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId, decision, reviewer: "local_reviewer" }),
      }).then((res) => res.json());
      renderReviewer(result.snapshot);
      await refreshDossier();
      await refreshEnterprise();
    }

    async function ingestDocument() {
      ingestButton.disabled = true;
      try {
        const file = docFile.files && docFile.files[0];
        const body = {
          title: docTitle.value || file?.name || "Untitled Document",
          mimeType: docMime.value,
          content: docContent.value,
          publicImpact: docPublicImpact.checked,
        };

        if (file) {
          body.title = docTitle.value || file.name;
          body.mimeType = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : docMime.value);
          if (body.mimeType === "application/pdf") {
            body.base64Content = arrayBufferToBase64(await file.arrayBuffer());
          } else {
            body.content = await file.text();
            docContent.value = body.content;
          }
          docMime.value = body.mimeType;
        }

        const jobResponse = await apiFetch("/api/ingest-document-async", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).then(async (res) => {
          const json = await res.json();
          if (!res.ok || json.ok === false) throw new Error(json.error || "Ingestion failed");
          return json;
        });

        renderIngestResult(jobResponse.result);
        await refreshJobs();
      } catch (error) {
        alert(error.message);
      } finally {
        ingestButton.disabled = false;
      }
    }

    async function currentPayload() {
      return JSON.parse(payloadEl.value);
    }

    async function runAssessment() {
      runButton.disabled = true;
      try {
        const input = await currentPayload();
        const [assessment, graph] = await Promise.all([
          apiFetch("/api/assess", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }).then((res) => res.json()),
          apiFetch("/api/graph", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }).then((res) => res.json())
        ]);
        renderAssessment(assessment, input);
        renderGraph(graph);
      } catch (error) {
        alert(error.message);
      } finally {
        runButton.disabled = false;
      }
    }

    async function boot() {
      const [reviewer, dossier, history, jobs] = await Promise.all([
        apiFetch("/api/reviewer-workspace").then((res) => res.json()),
        apiFetch("/api/dossier-preview").then((res) => res.json()),
        apiFetch("/api/ingestion-history").then((res) => res.json()),
        apiFetch("/api/jobs").then((res) => res.json())
      ]);
      renderReviewer(reviewer);
      renderDossier(dossier);
      renderHistory(history);
      renderJobs(jobs);
      await refreshEnterprise();
      await runAssessment();
    }

    runButton.addEventListener("click", runAssessment);
    ingestButton.addEventListener("click", ingestDocument);
    switchTenantButton.addEventListener("click", async () => {
      await apiFetch("/api/switch-tenant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: tenantSelect.value }),
      });
      await Promise.all([refreshHistory(), refreshJobs(), refreshReviewer(), refreshDossier(), refreshEnterprise()]);
    });
    createTenantButton.addEventListener("click", async () => {
      const name = document.getElementById("tenantName").value.trim();
      if (!name) return alert("Tenant name is required.");
      await apiFetch("/api/create-tenant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, plan: "enterprise", region: "us" }),
      });
      document.getElementById("tenantName").value = "";
      await Promise.all([refreshHistory(), refreshJobs(), refreshReviewer(), refreshDossier(), refreshEnterprise()]);
    });
    createUserButton.addEventListener("click", async () => {
      const email = document.getElementById("userEmail").value.trim();
      const displayName = document.getElementById("userDisplayName").value.trim();
      if (!email || !displayName) return alert("Email and display name are required.");
      await apiFetch("/api/create-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName, role: document.getElementById("userRole").value }),
      });
      document.getElementById("userEmail").value = "";
      document.getElementById("userDisplayName").value = "";
      await refreshEnterprise();
    });
    docFile.addEventListener("change", () => {
      const file = docFile.files && docFile.files[0];
      if (!file) return;
      docTitle.value = docTitle.value || file.name;
      docMime.value = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "text/plain");
    });
    resetButton.addEventListener("click", () => {
      payloadEl.value = JSON.stringify(sampleInput, null, 2);
      runAssessment();
    });
    exportButton.addEventListener("click", async () => {
      exportButton.disabled = true;
      try {
        const result = await apiFetch("/api/export-dossier", { method: "POST" }).then((res) => res.json());
        document.getElementById("dossierRaw").textContent = JSON.stringify(result, null, 2);
      } finally {
        exportButton.disabled = false;
      }
    });
    document.querySelectorAll("[data-report-format]").forEach((button) => {
      button.addEventListener("click", async () => {
        const format = button.getAttribute("data-report-format");
        const result = await apiFetch("/api/export-live-report?format=" + encodeURIComponent(format)).then((res) => res.json());
        document.getElementById("dossierRaw").textContent = result.content;
      });
    });

    saveApiKeyButton.addEventListener("click", async () => {
      const key = apiKeyInput.value.trim();
      if (key) {
        localStorage.setItem(API_KEY_STORAGE, key);
      } else {
        localStorage.removeItem(API_KEY_STORAGE);
      }
      updateApiKeyUi();
      await boot().catch((error) => alert(error.message));
    });

    clearApiKeyButton.addEventListener("click", () => {
      localStorage.removeItem(API_KEY_STORAGE);
      updateApiKeyUi();
    });

    updateApiKeyUi();
    if (apiKeyRequired && !savedApiKey()) {
      apiKeyStatus.value = "API key required";
    } else {
      boot().catch((error) => {
        apiKeyStatus.value = error.message.includes("API key") ? "API key required or invalid" : "Startup error";
        console.error(error);
      });
    }
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const ctx: RequestContext = {
    requestId: req.headers["x-request-id"]?.toString() || randomUUID(),
    startedAt: Date.now(),
    method: req.method ?? "GET",
    pathname: url.pathname,
  };

  try {
    if (!apiKeyAllowed(req, res, url.pathname, ctx)) return;

    if (url.pathname === "/healthz") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, { ok: true, status: "healthy", uptimeSeconds: Math.round((Date.now() - SERVER_STARTED_AT) / 1000) }, 200, ctx);
      return;
    }

    if (url.pathname === "/readyz") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      const diagnostics = await repositoryDiagnostics();
      sendJson(res, {
        ok: diagnostics.ok && diagnostics.configured,
        status: diagnostics.ok && diagnostics.configured ? "ready" : "not_ready",
        repository: {
          mode: diagnostics.mode,
          configured: diagnostics.configured,
          requestedRepository: diagnostics.requestedRepository,
        },
        error: diagnostics.error,
      }, diagnostics.ok && diagnostics.configured ? 200 : 503, ctx);
      return;
    }

    if (url.pathname === "/api/assess") {
      if (!methodAllowed(req, res, ["GET", "POST"], ctx)) return;
      const payload = await parseAssessmentPayload(req);
      const result = await assessClaimHandler(payload);
      sendJson(res, result.body, result.status, ctx);
      return;
    }

    if (url.pathname === "/api/ingest-document") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      const payload = await parseJsonPayload(req);
      sendJson(res, await ingestDocumentHandler(payload), 200, ctx);
      return;
    }

    if (url.pathname === "/api/ingest-document-async") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      const payload = await parseJsonPayload(req);
      sendJson(res, await ingestDocumentJobHandler(payload), 200, ctx);
      return;
    }

    if (url.pathname === "/api/ingestion-history") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await listIngestionHistoryHandler(), 200, ctx);
      return;
    }

    if (url.pathname === "/api/jobs") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await listJobsHandler(), 200, ctx);
      return;
    }

    if (url.pathname.startsWith("/api/jobs/")) {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await getJobHandler(url.pathname.split("/").pop() || ""), 200, ctx);
      return;
    }

    if (url.pathname === "/api/review-action") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      const payload = await parseJsonPayload(req);
      sendJson(res, await applyReviewActionHandler(payload), 200, ctx);
      return;
    }

    if (url.pathname === "/api/enterprise-state") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await enterpriseAdminStateHandler(), 200, ctx);
      return;
    }

    if (url.pathname === "/api/audit-log") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await auditLogHandler(), 200, ctx);
      return;
    }

    if (url.pathname === "/api/create-tenant") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      sendJson(res, await createTenantHandler(await parseJsonPayload(req)), 200, ctx);
      return;
    }

    if (url.pathname === "/api/switch-tenant") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      sendJson(res, await switchTenantHandler(await parseJsonPayload(req)), 200, ctx);
      return;
    }

    if (url.pathname === "/api/create-user") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      sendJson(res, await createUserHandler(await parseJsonPayload(req)), 200, ctx);
      return;
    }

    if (url.pathname === "/api/repository-diagnostics") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await repositoryDiagnostics(), 200, ctx);
      return;
    }

    if (url.pathname === "/api/graph") {
      if (!methodAllowed(req, res, ["GET", "POST"], ctx)) return;
      const payload = await parseAssessmentPayload(req);
      sendJson(res, getClaimGraphPayload(payload), 200, ctx);
      return;
    }

    if (url.pathname === "/api/reviewer-workspace") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await buildDemoReviewerWorkspace(), 200, ctx);
      return;
    }

    if (url.pathname === "/api/dossier-preview") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await buildDossierPreview(), 200, ctx);
      return;
    }

    if (url.pathname === "/api/export-live-report") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      const format = url.searchParams.get("format") ?? "markdown";
      if (!["markdown", "json", "html"].includes(format)) {
        sendJson(res, { ok: false, error: "Unsupported report format." }, 400, ctx);
        return;
      }
      sendJson(res, await exportLiveReport(format as "markdown" | "json" | "html"), 200, ctx);
      return;
    }

    if (url.pathname === "/api/export-dossier") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      sendJson(res, await exportDossierHandler(), 200, ctx);
      return;
    }

    if (url.pathname === "/downloads/veritas-operations-manual.md") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendDownload(res, DOWNLOADS.operationsManualMarkdown, "veritas-operations-manual.md", "text/markdown; charset=utf-8", ctx);
      return;
    }

    if (url.pathname === "/downloads/veritas-operations-manual.pdf") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendDownload(res, DOWNLOADS.operationsManualPdf, "veritas-operations-manual.pdf", "application/pdf", ctx);
      return;
    }

    if (url.pathname === "/assets/veritas-systems-logo.png") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendAsset(res, ASSETS.veritasLogo, "image/png", ctx);
      return;
    }

    if (url.pathname === "/assets/veritas-truth-engine-logo.png") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendAsset(res, ASSETS.truthEngineLogo, "image/png", ctx);
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      res.writeHead(200, securityHeaders({ "content-type": "text/html; charset=utf-8" }, ctx.requestId));
      res.end(appHtml);
      logRequest(ctx, 200);
      return;
    }

    if (url.pathname === "/favicon.ico") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      res.writeHead(204, securityHeaders({}, ctx.requestId));
      res.end();
      logRequest(ctx, 204);
      return;
    }

    res.writeHead(404, securityHeaders({ "content-type": "text/plain; charset=utf-8" }, ctx.requestId));
    res.end("Not found");
    logRequest(ctx, 404);
  } catch (error) {
    sendJson(
      res,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
      ctx
    );
  }
});

server.listen(PORT, () => {
  console.log(`Veritas Truth Engine running at http://localhost:${PORT}`);
});
