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
  removeUserHandler,
  switchTenantHandler,
} from "../api/enterprise-admin.js";
import { integrationStatusHandler } from "../api/integrations.js";
import { exportDossierHandler, buildDossierPreview } from "../api/export-dossier.js";
import { exportLiveReport } from "../api/export-report.js";
import { HttpStatusError } from "../api/http-error.js";
import { getClaimGraphPayload } from "../api/graph.js";
import {
  getIngestionHandler,
  getJobHandler,
  ingestDocumentHandler,
  ingestDocumentJobHandler,
  listIngestionHistoryWithQuery,
  listJobsWithQuery,
} from "../api/ingest-document.js";
import { applyReviewActionHandler, reviewerWorkspaceHandler } from "../api/reviewer-workspace.js";
import { repositoryDiagnostics } from "../lib/enterprise-repository-factory.js";
import { localAuthStore, type AuthUserSessionView } from "../lib/local-auth-store.js";
import { renderPdfPreviewHtml, resolvePdfPreviewSource } from "./pdf-preview.js";
import { sampleInput } from "./sample-input.js";

function loadDotEnv(rootDir: string): void {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const ROOT_DIR = process.cwd();
loadDotEnv(ROOT_DIR);

const PORT = Number(process.env.PORT ?? 3017);
const MAX_BODY_BYTES = Number(process.env.VERITAS_MAX_BODY_BYTES ?? 25_000_000);
const API_KEY = process.env.VERITAS_API_KEY;
const LOG_LEVEL = process.env.VERITAS_LOG_LEVEL ?? "info";
const SERVER_STARTED_AT = Date.now();
const DOWNLOADS = {
  operationsManualMarkdown: path.join(ROOT_DIR, "docs", "veritas_operations_manual.md"),
  operationsManualPdf: path.join(ROOT_DIR, "docs", "veritas_operations_manual.pdf"),
  latestDossierPdf: path.join(ROOT_DIR, "artifacts", "veritas-evidence-dossier.pdf"),
};
const ASSETS = {
  veritasLogo: path.join(ROOT_DIR, "public", "assets", "veritas-systems-logo.png"),
  truthEngineLogo: path.join(ROOT_DIR, "public", "assets", "veritas-truth-engine-logo.png"),
  introVideo: path.join(ROOT_DIR, "public", "assets", "veritas-truth-engine-intro.mp4"),
};
const PDFJS_ROOT = path.join(ROOT_DIR, "public", "pdfjs");
const AUTH_SESSION_COOKIE = "veritas_session";
const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

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

function sendJson(
  res: any,
  body: unknown,
  status = 200,
  ctx?: RequestContext,
  extraHeaders: Record<string, string | string[]> = {}
): void {
  res.writeHead(status, securityHeaders({ "content-type": "application/json; charset=utf-8", ...extraHeaders }, ctx?.requestId));
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

function pdfJsContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".mjs":
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ttf":
      return "font/ttf";
    case ".pfb":
      return "application/x-font-type1";
    case ".json":
      return "application/json; charset=utf-8";
    case ".ftl":
      return "text/plain; charset=utf-8";
    case ".bcmap":
    case ".wasm":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

function resolvePdfJsAsset(filePathFragment: string): { filePath: string; contentType: string } | null {
  const sanitized = filePathFragment.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!sanitized) return null;
  const resolvedPath = path.resolve(PDFJS_ROOT, sanitized);
  if (resolvedPath !== PDFJS_ROOT && !resolvedPath.startsWith(`${PDFJS_ROOT}${path.sep}`)) return null;
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) return null;
  return {
    filePath: resolvedPath,
    contentType: pdfJsContentType(resolvedPath),
  };
}

function methodAllowed(req: any, res: any, methods: string[], ctx?: RequestContext): boolean {
  if (methods.includes(req.method)) return true;
  res.writeHead(405, securityHeaders({ allow: methods.join(", "), "content-type": "application/json; charset=utf-8" }, ctx?.requestId));
  res.end(JSON.stringify({ ok: false, error: `Method ${req.method} is not allowed.` }, null, 2));
  if (ctx) logRequest(ctx, 405);
  return false;
}

function sendRedirect(res: any, location: string, status = 302, ctx?: RequestContext, extraHeaders: Record<string, string | string[]> = {}): void {
  res.writeHead(status, securityHeaders({ location, ...extraHeaders }, ctx?.requestId));
  res.end();
  if (ctx) logRequest(ctx, status, { location });
}

function readCookies(req: any): Record<string, string> {
  const header = String(req.headers.cookie ?? "");
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) return acc;
    const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
    const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
    if (key) acc[key] = value;
    return acc;
  }, {});
}

function authSessionToken(req: any): string | null {
  return readCookies(req)[AUTH_SESSION_COOKIE] || null;
}

function authenticatedUser(req: any): AuthUserSessionView | null {
  return localAuthStore.sessionUser(authSessionToken(req));
}

function sessionCookie(token: string): string {
  return `${AUTH_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_SESSION_MAX_AGE_SECONDS}`;
}

function clearSessionCookie(): string {
  return `${AUTH_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function safeInternalPath(value: string | null | undefined, fallback = "/start"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.startsWith("/auth") || value.startsWith("/api/auth") || value.startsWith("/transition")) return fallback;
  return value;
}

function authRedirectTarget(url: URL): string {
  return safeInternalPath(`${url.pathname}${url.search}`, "/start");
}

function requiresAuth(pathname: string): boolean {
  if (
    pathname === "/healthz" ||
    pathname === "/readyz" ||
    pathname === "/favicon.ico" ||
    pathname === "/__veritas_live_reload" ||
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/assets/")
  ) {
    return false;
  }
  return pathname.startsWith("/api/") || pathname.startsWith("/downloads/") || pathname === "/transition" || [
    "/start",
    "/ingest",
    "/results",
    "/review",
    "/report",
    "/settings",
    "/pdf-preview",
  ].includes(pathname);
}

function apiKeyAllowed(req: any, res: any, pathname: string, ctx?: RequestContext): boolean {
  const publicPaths = new Set([
    "/",
    "/index.html",
    "/auth",
    "/start",
    "/ingest",
    "/results",
    "/review",
    "/report",
    "/settings",
    "/transition",
    "/favicon.ico",
    "/healthz",
    "/readyz",
    "/__veritas_live_reload",
  ]);
  if (!API_KEY || publicPaths.has(pathname) || pathname.startsWith("/downloads/") || pathname.startsWith("/assets/") || pathname.startsWith("/api/auth/")) return true;
  if (authenticatedUser(req)) return true;
  const supplied = req.headers["x-veritas-api-key"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (supplied === API_KEY) return true;
  sendJson(res, {
    ok: false,
    error: "API key missing or invalid.",
    remediation: "Open Settings > System access, enter the shared access key, then save it for this browser.",
  }, 401, ctx);
  return false;
}

function attachLiveReload(req: any, res: any, ctx: RequestContext): void {
  res.writeHead(200, securityHeaders({
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  }, ctx.requestId));
  res.write(": connected\n\n");
  logRequest(ctx, 200);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
  });
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
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpStatusError(400, "Request JSON is not formatted correctly.", {
      remediation: "Send a valid claim package JSON body, or use the sample claim from the browser UI.",
    });
  }
}

async function parseJsonPayload(req: any) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpStatusError(400, "Request JSON is not formatted correctly.", {
      remediation: "Check commas, quotes, and braces before submitting again.",
    });
  }
}

function parseInteger(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanFlag(value: string | null): boolean | undefined {
  if (value === null || value === "" || value === "any") return undefined;
  if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  throw new HttpStatusError(400, `Boolean query value "${value}" is not supported.`, {
    remediation: "Use true, false, or any.",
  });
}

function renderAppHtml(currentPage: string, authUser: AuthUserSessionView): string {
  return `<!doctype html>
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

    .hero, .section {
      display: none;
    }

    body[data-page="start"] .hero {
      display: grid;
    }

    body[data-page="start"] #start,
    body[data-page="start"] #pipeline,
    body[data-page="ingest"] #ingest,
    body[data-page="assess"] #assess,
    body[data-page="assess"] #graph,
    body[data-page="review"] #review,
    body[data-page="dossier"] #dossier,
    body[data-page="enterprise"] #enterprise {
      display: block;
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

    .topbar-tools {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .user-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #fffaf3;
      color: var(--ink);
      font-size: 12px;
      font-weight: 700;
    }

    .workflow-nav {
      position: sticky;
      top: 70px;
      z-index: 4;
      background: rgba(246,243,237,0.96);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--line);
      padding: 10px 28px;
    }

    .workflow-nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .workflow-steps {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .workflow-steps a {
      text-decoration: none;
      color: var(--muted);
      padding: 7px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      background: #fffaf3;
      transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
    }

    .workflow-steps a:hover,
    .workflow-steps a.active {
      background: #ebe4d8;
      border-color: var(--teal);
      color: var(--ink);
    }

    .workflow-steps a.complete {
      border-color: var(--green);
      color: var(--green);
      background: #edf8f2;
    }

    .workflow-steps a.pending {
      border-color: var(--gold);
      color: #8b5f08;
      background: #fff6df;
    }

    .workflow-steps a.blocked {
      border-color: var(--red);
      color: var(--red);
      background: #fdeceb;
    }

    .workflow-next {
      margin: 0;
      white-space: nowrap;
    }

    .workflow-next.blocked {
      border-color: var(--red);
      color: #fffaf0;
      background: var(--red);
    }

    .workflow-next.pending {
      border-color: var(--gold);
      color: #fffaf0;
      background: #8b5f08;
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

    nav a:hover,
    nav a.active { background: #ebe4d8; color: var(--ink); }

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

    .guide-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(180px, 1fr));
      gap: 12px;
    }

    .guide-step {
      background: var(--surface);
      border: 1px solid var(--line);
      border-top: 4px solid var(--teal);
      border-radius: 8px;
      padding: 16px;
      min-height: 172px;
      display: grid;
      align-content: start;
      gap: 10px;
    }

    .guide-step:nth-child(2) { border-top-color: var(--gold); }
    .guide-step:nth-child(3) { border-top-color: var(--red); }
    .guide-step:nth-child(4) { border-top-color: var(--green); }
    .guide-step strong { font-size: 18px; }
    .guide-step span { color: var(--muted); line-height: 1.45; }

    .dashboard-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(160px, 1fr));
      gap: 12px;
      margin: 18px 0;
    }

    .dashboard-metric {
      background: var(--surface);
      border: 1px solid var(--line);
      border-top: 4px solid var(--teal);
      border-radius: 8px;
      padding: 16px;
      display: grid;
      gap: 6px;
    }

    .dashboard-metric:nth-child(2) { border-top-color: var(--gold); }
    .dashboard-metric:nth-child(3) { border-top-color: var(--red); }
    .dashboard-metric:nth-child(4) { border-top-color: var(--green); }
    .dashboard-metric span { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; }
    .dashboard-metric strong { font-size: clamp(24px, 3vw, 34px); }

    .audience-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(240px, 1fr));
      gap: 16px;
      margin: 18px 0 20px;
    }

    .audience-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-top: 4px solid var(--teal);
      border-radius: 8px;
      padding: 20px;
      display: grid;
      gap: 12px;
    }

    .audience-card.reviewer { border-top-color: var(--gold); }
    .audience-card.corporate { border-top-color: var(--red); }
    .audience-card.selected {
      box-shadow: 0 0 0 2px rgba(9, 113, 109, 0.18);
      transform: translateY(-1px);
    }
    .audience-card p { margin: 0; color: var(--muted); line-height: 1.55; }

    .audience-role-note {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .audience-summary {
      border-left: 4px solid var(--line);
      padding-left: 12px;
      color: var(--ink);
      font-weight: 600;
      line-height: 1.5;
    }

    .audience-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .role-brief {
      margin-top: 12px;
      margin-bottom: 20px;
    }

    .story-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(220px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .story-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      display: grid;
      gap: 8px;
      border-top: 4px solid var(--teal);
    }

    .story-card:nth-child(2) { border-top-color: var(--gold); }
    .story-card:nth-child(3) { border-top-color: var(--green); }
    .story-card strong { font-size: 18px; }
    .story-card span { color: var(--muted); line-height: 1.45; }

    .helper {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
      margin: 8px 0 14px;
    }

    .status-note {
      border-left: 4px solid var(--teal);
      background: #eef7f5;
      color: var(--ink);
      border-radius: 8px;
      padding: 12px;
      margin: 12px 0;
      line-height: 1.45;
    }

    .status-note.warning {
      border-left-color: var(--gold);
      background: #fff5dc;
    }

    .status-note.danger {
      border-left-color: var(--red);
      background: #fbe7e3;
    }

    .app-message {
      position: sticky;
      top: 132px;
      z-index: 4;
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 28px;
      pointer-events: none;
    }

    .app-message div {
      display: none;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #fffaf3;
      padding: 12px 14px;
      box-shadow: 0 12px 28px rgba(16,16,15,0.12);
      pointer-events: auto;
    }

    .app-message div.visible {
      display: block;
    }

    .app-message div.warning {
      border-left: 4px solid var(--gold);
    }

    .app-message div.danger {
      border-left: 4px solid var(--red);
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

    .panel.role-focused {
      border-color: rgba(9, 113, 109, 0.5);
      box-shadow: 0 10px 24px rgba(9, 113, 109, 0.08);
    }

    .panel.role-softened {
      opacity: 0.62;
      border-style: dashed;
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

    .toolbar-grid {
      display: grid;
      grid-template-columns: minmax(180px, 1.3fr) repeat(3, minmax(130px, 0.7fr));
      gap: 10px;
      margin: 8px 0 14px;
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

    .instruction-list {
      display: grid;
      gap: 10px;
      margin: 14px 0 0;
    }

    .instruction-card {
      border: 1px solid var(--line);
      border-left: 4px solid var(--teal);
      background: #fffaf3;
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 6px;
    }

    .details-block {
      margin-top: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }

    .details-block summary {
      cursor: pointer;
      padding: 12px 14px;
      font-weight: 800;
      list-style: none;
      background: #f4eee2;
    }

    .details-block summary::-webkit-details-marker {
      display: none;
    }

    .details-block .details-body {
      padding: 14px;
      border-top: 1px solid var(--line);
    }

    .meaning-list {
      margin: 12px 0 0;
      padding-left: 18px;
      color: var(--muted);
      line-height: 1.6;
    }

    .meaning-list li + li {
      margin-top: 6px;
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
      .hero, .workspace, .section-heading, .graph-wrap, .dossier-grid, .admin-grid, .guide-grid, .story-grid, .dashboard-metrics, .audience-grid {
        grid-template-columns: 1fr;
      }

      .workflow-nav {
        top: 82px;
      }

      .app-message {
        top: 168px;
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
  <script>
    (() => {
      if (!("EventSource" in window)) return;
      let reloading = false;

      const waitForServer = async () => {
        while (!reloading) {
          try {
            const response = await fetch("/healthz", { cache: "no-store" });
            if (response.ok) {
              reloading = true;
              window.location.reload();
              return;
            }
          } catch {
            // The dev server is restarting.
          }
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      };

      const source = new EventSource("/__veritas_live_reload");
      source.onerror = () => {
        source.close();
        waitForServer();
      };
    })();
  </script>
</head>
<body data-page="${currentPage}">
  <section class="hero" id="top">
    <div class="hero-copy">
      <img class="hero-logo" src="/assets/veritas-systems-logo.png" alt="Veritas Systems" />
      <p class="eyebrow">Root dependency for verified systems</p>
      <h1>Veritas Truth Engine</h1>
      <p>One workspace for daily verification work and organizational oversight. Most people stay in the guided daily path. Corporate teams use the admin side for access, tenant, audit, and release governance.</p>
      <div class="hero-actions">
        <a class="button" href="/start">Open work hub</a>
        <a class="button secondary" href="/settings">Open admin controls</a>
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
      <a href="/start" data-nav-link="start">Home</a>
      <a href="/ingest" data-nav-link="ingest">Intake</a>
      <a href="/results" data-nav-link="assess">Findings</a>
      <a href="/review" data-nav-link="review">Review Queue</a>
      <a href="/report" data-nav-link="dossier">Reports</a>
      <a href="/settings" data-nav-link="enterprise">Admin</a>
    </nav>
    <div class="topbar-tools">
      <div class="user-pill">Signed in as ${escapeHtml(authUser.displayName)} · ${escapeHtml(authUser.email)}</div>
      <button class="button secondary" type="button" id="signOutButton">Sign out</button>
    </div>
  </header>

  <section class="workflow-nav" aria-label="Workflow navigator">
    <div class="inner workflow-nav-inner">
      <div class="workflow-steps" id="workflowSteps">
        <a href="/start" data-workflow-link="start">Home</a>
        <a href="/ingest" data-workflow-link="ingest">Intake</a>
        <a href="/results" data-workflow-link="assess">Findings</a>
        <a href="/review" data-workflow-link="review">Review</a>
        <a href="/report" data-workflow-link="dossier">Reports</a>
        <a href="/settings" data-workflow-link="enterprise">Admin</a>
      </div>
      <a class="button secondary workflow-next" id="nextActionButton" href="/ingest">Next: Open intake</a>
    </div>
  </section>

  <div class="app-message" aria-live="polite"><div id="appMessage"></div></div>

  <section class="section" id="start">
    <div class="inner">
      <div class="section-heading">
        <h2>Choose today&apos;s workspace.</h2>
        <p>Veritas is organized by role. Analysts bring in and inspect evidence, reviewers resolve flagged decisions, and administrators manage protected access, tenant operations, and governance.</p>
      </div>
      <div id="quickAccessSummary" class="status-note">Checking access requirements.</div>
      <div class="dashboard-metrics">
        <div class="dashboard-metric"><span>Sources On File</span><strong id="homeIngestionCount">--</strong></div>
        <div class="dashboard-metric"><span>Active Jobs</span><strong id="homeJobCount">--</strong></div>
        <div class="dashboard-metric"><span>Reviews Waiting</span><strong id="homeReviewCount">--</strong></div>
        <div class="dashboard-metric"><span>Release Status</span><strong id="homeReleaseStatus">Awaiting first run</strong></div>
      </div>
      <div class="audience-grid">
        <div class="audience-card" data-role-card="analyst">
          <h3>Analyst</h3>
          <div class="audience-role-note" id="homeAnalystRoleNote">Role workspace</div>
          <p>For people bringing in source material, checking findings, and moving claims toward a release decision.</p>
          <div id="homeAnalystSummary" class="audience-summary">Bring in one source, let Veritas score it, and only step into review if the gate flags risk.</div>
          <div class="audience-actions">
            <a class="button" href="/ingest">Open intake</a>
            <a class="button secondary" href="/results">Open findings</a>
            <a class="button secondary" href="/report">Open reports</a>
            <button class="button secondary" type="button" data-set-role="analyst">Use analyst mode</button>
          </div>
        </div>
        <div class="audience-card reviewer" data-role-card="reviewer">
          <h3>Reviewer</h3>
          <div class="audience-role-note" id="homeReviewerRoleNote">Role workspace</div>
          <p>For people who handle uncertainty, contradiction, public-impact claims, and release blocking decisions.</p>
          <div id="homeReviewerSummary" class="audience-summary">No review work is waiting yet. When Veritas flags risk, the next decision will appear here.</div>
          <div class="audience-actions">
            <a class="button" href="/review">Open review queue</a>
            <a class="button secondary" href="/results">Open findings</a>
            <a class="button secondary" href="/report">Check release outputs</a>
            <button class="button secondary" type="button" data-set-role="reviewer">Use reviewer mode</button>
          </div>
        </div>
        <div class="audience-card corporate" data-role-card="admin">
          <h3>Admin</h3>
          <div class="audience-role-note" id="homeAdminRoleNote">Role workspace</div>
          <p>For corporate and administrative users responsible for protected access, tenant setup, user management, audit history, and operational governance.</p>
          <div id="homeAdminSummary" class="audience-summary">Use Admin to manage the environment, confirm the active tenant, and monitor governance before wider rollout.</div>
          <div class="audience-actions">
            <a class="button" href="/settings">Open admin</a>
            <a class="button secondary" href="/report">Check release outputs</a>
            <a class="button secondary" href="/review">Open review queue</a>
            <button class="button secondary" type="button" data-set-role="admin">Use admin mode</button>
          </div>
        </div>
      </div>
      <div id="workflowStatus" class="status-note">Ready for a source document. Open Intake first.</div>
      <div id="workflowInstruction" class="status-note" style="margin-top:10px">Human input is not needed yet. Add one source and let the automated workflow decide whether review is required.</div>
      <div class="hero-actions" style="margin-top:16px;margin-bottom:18px">
        <button class="button" id="automatedTruthRun">Run automated truth workflow</button>
        <a class="button secondary" href="/ingest">Open source intake</a>
      </div>
    </div>
  </section>

  <section class="section" id="pipeline">
    <div class="inner">
      <div class="section-heading">
        <h2>How your information moves.</h2>
        <p>You should not need a systems diagram in your head to use Veritas. In everyday terms, it reads what you gave it, breaks that material into checkable claims, compares those claims with the evidence it found, and then tells you whether a person needs to review the result.</p>
      </div>
      <div class="story-grid">
        <div class="story-card"><strong>You add one source</strong><span>A pasted text, memo, report, or PDF becomes the starting point for the whole workflow.</span></div>
        <div class="story-card"><strong>Veritas turns it into checkable statements</strong><span>Instead of treating the whole document as one answer, it separates the material into smaller claims it can test against quoted evidence.</span></div>
        <div class="story-card"><strong>You only step in when risk is high</strong><span>If the evidence is weak, contradictory, or sensitive, Veritas pauses and asks for human review before anything can be released.</span></div>
      </div>
      <div class="pipeline">
        <div class="stage"><b>1. Read the source</b><span>Veritas reads your text or file, keeps track of where it came from, and prepares it for checking.</span></div>
        <div class="stage"><b>2. Pull out claims</b><span>It finds statements that can be tested instead of treating the whole document as one big claim.</span></div>
        <div class="stage"><b>3. Match quotes to claims</b><span>Each claim is tied to specific supporting or contradicting passages so the result stays explainable.</span></div>
        <div class="stage"><b>4. Look for conflict</b><span>Claims and sources are compared to spot disagreement, missing context, or unstable narratives.</span></div>
        <div class="stage"><b>5. Score the evidence</b><span>Veritas weighs evidence strength, source trust, traceability, timing, and contradiction pressure.</span></div>
        <div class="stage"><b>6. Show the reasoning</b><span>The graph and timeline make it easier to inspect how the claim connects back to real sources.</span></div>
        <div class="stage"><b>7. Decide the next step</b><span>The system either clears the result for controlled use, asks for human review, or blocks release.</span></div>
      </div>
    </div>
  </section>

  <section class="section" id="ingest">
    <div class="inner">
      <div class="section-heading">
        <h2>Daily intake workspace.</h2>
        <p>Bring in source material here. Veritas turns it into checkable claims, binds those claims to evidence, and routes only risky items into review.</p>
      </div>
      <div id="roleIngestNote" class="status-note role-brief">Analyst guidance loads here.</div>
      <div class="workspace">
        <div class="panel" id="ingestInputPanel">
          <h3>Document Input</h3>
          <p class="helper">Upload a file or paste text. If a file is selected, Veritas uses the file instead of the text box. For PDFs, upload the PDF file or paste extracted text as Text. For large files or large batch imports, use the automated inbox flow from Admin with <code>npm run bulk:ingest</code> or <code>npm run bulk:watch</code>.</p>
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
            <button class="button secondary" id="automatedTruthRunIngest">Run full workflow</button>
            <label style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:8px;font-weight:700;color:var(--ink)">
              <input id="docPublicImpact" type="checkbox" checked />
              public-impact review gate
            </label>
          </div>
        </div>
        <div class="panel" id="ingestOutputPanel">
          <h3>What Veritas found</h3>
          <p class="helper">After processing, this area explains what happened in plain language first. Raw system identifiers are still available below if you need them.</p>
          <div id="processingExplainer" class="status-note">No document processed yet. When you ingest a source, Veritas will summarize what it read, how many claims it found, and whether any human review is needed.</div>
          <div id="processingChecklist" class="instruction-list"></div>
          <div class="result-grid">
            <div class="metric"><span>Chunks</span><strong id="chunkCount">--</strong></div>
            <div class="metric"><span>Claims</span><strong id="claimCount">--</strong></div>
            <div class="metric"><span>Reviews</span><strong id="ingestReviewCount">--</strong></div>
          </div>
          <details class="details-block" id="ingestAdvancedDetails">
            <summary>Advanced processing details</summary>
            <div class="details-body">
              <div id="ingestSummary" class="mono" style="max-height:150px"></div>
            </div>
          </details>
          <div id="claimList" class="claim-list"></div>
          <h3 style="margin-top:24px">Saved Ingestions</h3>
          <div class="toolbar-grid">
            <label>Search
              <input id="historySearch" placeholder="title, claim, quote, source" />
            </label>
            <label>Release gate
              <select id="historyReleaseState">
                <option value="any">Any</option>
                <option value="auto_release">Auto release</option>
                <option value="review_required">Review required</option>
                <option value="hold">Hold</option>
              </select>
            </label>
            <label>Type
              <select id="historyMimeType">
                <option value="any">Any</option>
                <option value="text/plain">Text</option>
                <option value="text/markdown">Markdown</option>
                <option value="application/json">JSON</option>
                <option value="application/pdf">PDF</option>
              </select>
            </label>
            <label>Impact
              <select id="historyPublicImpact">
                <option value="any">Any</option>
                <option value="true">Public impact</option>
                <option value="false">Internal only</option>
              </select>
            </label>
          </div>
          <div id="historyList" class="history-list"></div>
          <h3 style="margin-top:24px">Processing Jobs</h3>
          <div class="toolbar-grid">
            <label>Search
              <input id="jobSearch" placeholder="job title, type, error, result" />
            </label>
            <label>Status
              <select id="jobStatus">
                <option value="any">Any</option>
                <option value="queued">Queued</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label>Type
              <select id="jobType">
                <option value="any">Any</option>
                <option value="document_ingestion">Document ingestion</option>
                <option value="report_export">Report export</option>
                <option value="dossier_export">Dossier export</option>
                <option value="ocr_extraction">OCR extraction</option>
              </select>
            </label>
            <div class="status-note" style="margin:22px 0 0">Search stays tenant-scoped and updates from the local API.</div>
          </div>
          <div id="jobList" class="history-list"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="assess">
    <div class="inner">
      <div class="section-heading">
        <h2>Findings and evidence.</h2>
        <p>Read the selected claim here in plain language: how strong the evidence is, whether the claim is likely true, and whether it can be released or must stop for review.</p>
      </div>
      <div id="roleAssessNote" class="status-note role-brief">Role-specific findings guidance loads here.</div>
      <div class="workspace">
        <div class="panel" id="assessAdvancedPanel">
          <h3>Advanced JSON input</h3>
          <p class="helper">Most people will not need to touch this. The automated workflow fills it in for you. Keep it for testing, debugging, or audit work.</p>
          <textarea id="payload"></textarea>
          <div class="hero-actions">
            <button class="button" id="run">Assess claim</button>
            <button class="button secondary" id="reset">Reset sample</button>
          </div>
        </div>
        <div class="panel" id="assessPrimaryPanel">
          <h3>Assessment</h3>
          <p class="helper">This is the plain-language reading of the selected claim. The score is the system's confidence in the claim. The release gate is the practical action you should take next.</p>
          <div id="assessmentMeaning" class="status-note">Select or generate a claim to see a plain-language explanation of what the score means and what happens next.</div>
          <ul id="assessmentChecklist" class="meaning-list"></ul>
          <div class="result-grid">
            <div class="metric"><span>Truth score</span><strong id="truthScore">--</strong></div>
            <div class="metric"><span>Truth state</span><strong id="truthState">--</strong></div>
            <div class="metric"><span>Release gate</span><strong id="releaseState">--</strong></div>
          </div>
          <p class="helper">Cleared for controlled release means the evidence currently looks strong enough for controlled use. Needs human review means a person must confirm it. Do not release means the claim should stay blocked until the evidence problem is fixed.</p>
          <div id="features" class="features"></div>
          <h3 style="margin-top:24px">Evidence quotes behind the result</h3>
          <div id="evidence" class="evidence-list"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="graph">
    <div class="inner">
      <div class="section-heading">
        <h2>See why Veritas decided that.</h2>
        <p>The graph connects the claim to sources and evidence. Contradictions stay visible so a supporting source cannot hide unresolved conflict.</p>
      </div>
      <div class="graph-wrap">
        <div id="graphCanvas" class="graph-canvas"></div>
        <div class="panel">
          <h3>Timeline</h3>
          <p class="helper">Green edges support the claim. Red edges contradict it. Labels are shortened; use Assessment evidence for the full quoted text.</p>
          <div id="timeline" class="timeline"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="review">
    <div class="inner">
      <div class="section-heading">
        <h2>Review queue.</h2>
        <p>Only flagged work lands here. Uncertain, risky, contradictory, or public-impact claims must be resolved before public release can move forward.</p>
      </div>
      <div id="roleReviewNote" class="status-note role-brief">Role-specific review guidance loads here.</div>
      <div class="status-note warning">Review action language: Hold sends a claim back for correction, Reject marks it unsupported, and Escalate keeps it deferred for specialist review.</div>
      <div class="admin-grid" style="margin-bottom:18px">
        <div class="panel" id="reviewActionPanel">
          <h3>Reviewer Input</h3>
          <p class="helper">Human input is only needed here when the gate flags a claim. Enter who is reviewing, read the claim summary, then choose the smallest correct action. Notes are required for Hold, Reject, and Escalate so the next reviewer knows what changed or what remains unresolved.</p>
          <div class="form-grid">
            <label>Reviewer name
              <input id="reviewerName" value="local_reviewer" />
            </label>
            <label>Required input
              <input id="reviewerInstructionStatus" readonly value="No human action required yet" />
            </label>
          </div>
          <label>Review notes
            <textarea id="reviewNotes" class="compact-textarea" style="min-height:140px" placeholder="Only needed when holding, rejecting, or escalating. Explain what evidence is missing, contradictory, or needs specialist review."></textarea>
          </label>
        </div>
        <div class="panel" id="reviewGuidePanel">
          <h3>What The Human Must Decide</h3>
          <div id="reviewInstructionList" class="instruction-list">
            <div class="instruction-card">
              <strong>1. Confirm the claim and source context.</strong>
              <span>Load the flagged claim, read the summary, and compare the bound evidence before acting.</span>
            </div>
            <div class="instruction-card">
              <strong>2. Use the smallest valid decision.</strong>
              <span>Approve when evidence is sufficient, Hold when correction is needed, Reject when unsupported, and Escalate when specialist judgment is required.</span>
            </div>
            <div class="instruction-card">
              <strong>3. Leave notes only when they add operational value.</strong>
              <span>Notes are mandatory for Hold, Reject, and Escalate. They are optional for Approve and Start.</span>
            </div>
          </div>
        </div>
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
        <h2>Reports and release.</h2>
        <p>Use this area when you are ready to package the evidence and act on the release recommendation. Export only what the gate allows.</p>
      </div>
      <div id="roleReportNote" class="status-note role-brief">Role-specific reporting guidance loads here.</div>
      <div class="dossier-grid">
        <div class="panel" id="reportDecisionPanel">
          <h3>Dossier Preview</h3>
          <p class="helper">Preview can show seeded sample records before live ingestion. Exports require live ingested records and must pass the release gate.</p>
          <div id="dossierSummary"></div>
          <div id="exportSummary" class="status-note" style="display:none"></div>
          <label style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:8px;font-weight:700;color:var(--ink);margin-top:12px">
            <input id="restrictedDossier" type="checkbox" />
            allow restricted internal dossier when public release is blocked
          </label>
          <div class="hero-actions">
            <button class="button" id="exportDossier">Build PDF artifact on server</button>
            <a class="button secondary" href="/pdf-preview?source=latest-dossier" target="_blank" rel="noreferrer">Open latest PDF in viewer</a>
          </div>
          <h3 style="margin-top:24px">Live Report Export</h3>
          <div class="hero-actions">
            <button class="button secondary" data-report-format="markdown">Markdown</button>
            <button class="button secondary" data-report-format="html">HTML</button>
            <button class="button secondary" data-report-format="json">JSON</button>
          </div>
        </div>
        <div class="panel" id="reportTechnicalPanel">
          <h3>Technical Details</h3>
          <p class="helper">Raw responses stay here for audit and troubleshooting. Use the summaries and status messages first.</p>
          <div id="dossierRaw" class="mono"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="enterprise">
    <div class="inner">
      <div class="section-heading">
        <h2>Admin and governance.</h2>
        <p>Corporate and administrative users manage protected access, tenants, users, repository health, integration boundaries, audit history, and operations policy here.</p>
      </div>
      <div id="roleAdminNote" class="status-note role-brief">Role-specific admin guidance loads here.</div>
      <div class="admin-grid">
        <div class="panel" id="adminControlPanel">
          <h3>Access, Tenant, And Users</h3>
          <p class="helper">You are already inside the system through your account sign-in. The shared access key below is optional and mainly useful for script or API access outside the signed-in browser session.</p>
          <div class="form-grid" style="margin-bottom:14px">
            <label>Shared access key
              <input id="apiKeyInput" type="password" placeholder="Only needed when protected mode is enabled" autocomplete="off" />
              <span class="helper">Stored only in this browser and sent with local requests.</span>
            </label>
            <label>Access status
              <input id="apiKeyStatus" readonly value="Checking access" />
            </label>
          </div>
          <div class="hero-actions" style="margin-top:0;margin-bottom:14px">
            <button class="button secondary" id="saveApiKey">Save access key</button>
            <button class="button secondary" id="clearApiKey">Remove saved key</button>
          </div>
          <h3>Active Tenant</h3>
          <div id="repoDiagnostics" class="mono" style="max-height:150px;margin-bottom:14px"></div>
          <div id="enterpriseSummary" class="status-note"></div>
          <div id="tenantSummary" class="mono" style="max-height:180px"></div>
          <h3 style="margin-top:24px">Integration Boundary</h3>
          <p class="helper">Veritas stays standalone by default. External systems only appear here through explicit adapters, and ChronoScope remains inactive until we deliberately implement it.</p>
          <div id="integrationSummary" class="status-note"></div>
          <div id="integrationList" class="history-list" style="margin-top:14px"></div>
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
          <p class="helper">Each user now has a clear remove action in the list below. The app will block deleting the last remaining user in the active tenant.</p>
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
        <div class="panel" id="adminGovernancePanel">
          <h3>Governance And Operations</h3>
          <p class="helper">Use this side for corporate oversight: operations policy, audit visibility, and the records that show how the current environment is being controlled.</p>
          <h3 style="margin-top:0">Operations Manual</h3>
          <p class="helper">Keep the operating runbook here in Settings so admins can quickly reach ingestion, review, export, tenant administration, monitoring, backup, and incident response guidance.</p>
          <div class="hero-actions" style="margin-bottom:24px">
            <a class="button" href="/pdf-preview?source=operations-manual" target="_blank" rel="noreferrer">Open manual in viewer</a>
            <a class="button secondary" href="/downloads/veritas-operations-manual.pdf">Download PDF manual</a>
            <a class="button secondary" href="/downloads/veritas-operations-manual.md">Download Markdown</a>
          </div>
          <h3>Large-File Automation</h3>
          <p class="helper">Use the filesystem automation path for large source sets instead of browser uploads. Place supported files in <code>automation/inbox</code>, then run <code>npm run bulk:ingest</code> for a one-time sweep or <code>npm run bulk:watch</code> to keep processing new files automatically. Supported formats: <code>.txt</code>, <code>.md</code>, <code>.json</code>, and <code>.pdf</code>.</p>
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
    const currentPage = ${JSON.stringify(currentPage)};
    const currentAuthUser = ${JSON.stringify(authUser)};
    const payloadEl = document.getElementById("payload");
    const runButton = document.getElementById("run");
    const resetButton = document.getElementById("reset");
    const exportButton = document.getElementById("exportDossier");
    const restrictedDossier = document.getElementById("restrictedDossier");
    const ingestButton = document.getElementById("ingestRun");
    const automatedTruthRunButton = document.getElementById("automatedTruthRun");
    const automatedTruthRunIngestButton = document.getElementById("automatedTruthRunIngest");
    const docFile = document.getElementById("docFile");
    const docMime = document.getElementById("docMime");
    const docTitle = document.getElementById("docTitle");
    const docContent = document.getElementById("docContent");
    const docPublicImpact = document.getElementById("docPublicImpact");
    const historySearch = document.getElementById("historySearch");
    const historyReleaseState = document.getElementById("historyReleaseState");
    const historyMimeType = document.getElementById("historyMimeType");
    const historyPublicImpact = document.getElementById("historyPublicImpact");
    const jobSearch = document.getElementById("jobSearch");
    const jobStatus = document.getElementById("jobStatus");
    const jobType = document.getElementById("jobType");
    const reviewerName = document.getElementById("reviewerName");
    const reviewNotes = document.getElementById("reviewNotes");
    const reviewerInstructionStatus = document.getElementById("reviewerInstructionStatus");
    const tenantSelect = document.getElementById("tenantSelect");
    const switchTenantButton = document.getElementById("switchTenant");
    const createTenantButton = document.getElementById("createTenant");
    const createUserButton = document.getElementById("createUser");
    const apiKeyInput = document.getElementById("apiKeyInput");
    const apiKeyStatus = document.getElementById("apiKeyStatus");
    const saveApiKeyButton = document.getElementById("saveApiKey");
    const clearApiKeyButton = document.getElementById("clearApiKey");
    const signOutButton = document.getElementById("signOutButton");
    const quickAccessSummary = document.getElementById("quickAccessSummary");
    const homeIngestionCount = document.getElementById("homeIngestionCount");
    const homeJobCount = document.getElementById("homeJobCount");
    const homeReviewCount = document.getElementById("homeReviewCount");
    const homeReleaseStatus = document.getElementById("homeReleaseStatus");
    const homeAnalystSummary = document.getElementById("homeAnalystSummary");
    const homeReviewerSummary = document.getElementById("homeReviewerSummary");
    const homeAdminSummary = document.getElementById("homeAdminSummary");
    const homeAnalystRoleNote = document.getElementById("homeAnalystRoleNote");
    const homeReviewerRoleNote = document.getElementById("homeReviewerRoleNote");
    const homeAdminRoleNote = document.getElementById("homeAdminRoleNote");
    const roleIngestNote = document.getElementById("roleIngestNote");
    const roleAssessNote = document.getElementById("roleAssessNote");
    const roleReviewNote = document.getElementById("roleReviewNote");
    const roleReportNote = document.getElementById("roleReportNote");
    const roleAdminNote = document.getElementById("roleAdminNote");
    const ingestInputPanel = document.getElementById("ingestInputPanel");
    const ingestOutputPanel = document.getElementById("ingestOutputPanel");
    const ingestAdvancedDetails = document.getElementById("ingestAdvancedDetails");
    const assessAdvancedPanel = document.getElementById("assessAdvancedPanel");
    const assessPrimaryPanel = document.getElementById("assessPrimaryPanel");
    const reviewActionPanel = document.getElementById("reviewActionPanel");
    const reviewGuidePanel = document.getElementById("reviewGuidePanel");
    const reportDecisionPanel = document.getElementById("reportDecisionPanel");
    const reportTechnicalPanel = document.getElementById("reportTechnicalPanel");
    const adminControlPanel = document.getElementById("adminControlPanel");
    const adminGovernancePanel = document.getElementById("adminGovernancePanel");
    const nextActionButton = document.getElementById("nextActionButton");
    const API_KEY_STORAGE = "veritas.apiKey";
    const ROLE_MODE_STORAGE = "veritas.roleMode";
    const PAYLOAD_STORAGE = "veritas.selectedPayload";
    const DOC_DRAFT_STORAGE = "veritas.docDraft";
    const workflowSectionOrder = ["start", "ingest", "assess", "review", "dossier", "enterprise"];
    let workflow = { ingestions: 0, jobs: 0, openReviews: 0, releaseRecommendation: "", automationRunning: false, nextTask: null };
    let adminSnapshot = { tenantName: "Loading tenant", repositoryMode: "checking", userCount: 0, integrationMode: "standalone" };

    const titleCase = (value) => String(value).replaceAll("_", " ");
    const humanLabel = (value) => ({
      auto_release: "Cleared for controlled release",
      review_required: "Needs human review",
      hold: "Do not release",
      strongly_supported: "Strongly supported",
      supported: "Supported",
      mixed_or_unresolved: "Mixed or unresolved",
      contested: "Contested",
      likely_true: "Likely true",
      likely_false: "Likely false",
      insufficient_evidence: "Insufficient evidence",
      supporting: "Supports the claim",
      contradicting: "Contradicts the claim",
      contextual: "Context only",
      public_impact_claim: "Public-impact claim",
      elevated_contradiction_pressure: "Elevated contradiction pressure",
      weak_provenance: "Weak provenance",
      low_evidence_support: "Low evidence support",
    }[value] || titleCase(value));
    const pct = (value) => Math.round(Number(value || 0) * 100);
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
    const safeClass = (value) => String(value ?? "").replace(/[^a-z0-9_-]/gi, "");
    const featureLabels = {
      evidenceSupport: "Evidence match",
      sourceReliability: "Source trust",
      provenanceIntegrity: "Traceability",
      independenceAdjustedCorroboration: "Independent agreement",
      temporalCoherence: "Timeline fit",
      causalCoherence: "Cause-and-effect fit",
      contradictionPressure: "Contradiction pressure",
      revisionStability: "Stability over time",
      deceptionSignal: "Manipulation risk",
    };

    const nativeInnerHtml = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");

    function evidenceBreakdown(evidence = []) {
      return evidence.reduce((summary, item) => {
        const key = item?.span?.evidenceRole || "contextual";
        summary[key] = (summary[key] || 0) + 1;
        return summary;
      }, { supporting: 0, contradicting: 0, contextual: 0 });
    }

    function releaseGateMeaning(releaseState) {
      return ({
        auto_release: "No review block is active right now, so this result can move forward in controlled workflows.",
        review_required: "A person still needs to confirm this claim before it can move forward.",
        hold: "The claim is blocked. It should not be released until the evidence issue is resolved.",
      }[releaseState] || "Check the release gate before using this result.");
    }

    function truthStateMeaning(truthState) {
      return ({
        strongly_supported: "The evidence is lining up clearly behind this claim.",
        supported: "The claim currently has more support than contradiction.",
        mixed_or_unresolved: "The evidence does not point strongly in one direction yet.",
        contested: "There is meaningful conflict around this claim.",
        likely_false: "The current evidence leans against this claim.",
        insufficient_evidence: "There is not enough strong evidence to make a reliable call.",
      }[truthState] || "The claim needs more review.");
    }

    function renderProcessingExplainer(result, selectedForAutomation, options = {}) {
      const explainer = document.getElementById("processingExplainer");
      const checklist = document.getElementById("processingChecklist");
      if (!explainer || !checklist) return;

      const claimCount = result.claimPackages.length;
      const reviewCount = result.reviewCount;
      const nextStep = reviewCount > 0
        ? "Human review is needed before public release."
        : claimCount > 0
          ? "No review block was created by this ingestion, so you can move on to the result and report steps."
          : "No claims were extracted yet, so the source may need clearer factual statements.";

      explainer.className = reviewCount > 0 ? "status-note warning" : "status-note";
      explainer.textContent = options.automated
        ? \`Veritas read "\${result.document.title}", broke it into \${result.chunks.length} text section(s), found \${claimCount} checkable claim(s), and flagged \${reviewCount} for human review.\`
        : \`Veritas read "\${result.document.title}", broke it into \${result.chunks.length} text section(s), and found \${claimCount} checkable claim(s).\`;

      checklist.innerHTML = \`
        <div class="instruction-card">
          <strong>What you gave Veritas</strong>
          <span>\${escapeHtml(result.document.title)} · \${escapeHtml(result.document.mimeType)} · \${result.document.parserName ? escapeHtml(result.document.parserName) : "local parser"}</span>
        </div>
        <div class="instruction-card">
          <strong>What Veritas did with it</strong>
          <span>It split the material into \${result.chunks.length} section(s), extracted \${claimCount} claim(s), and built evidence links for those claims.</span>
        </div>
        <div class="instruction-card">
          <strong>What happens next</strong>
          <span>\${escapeHtml(nextStep)}\${selectedForAutomation ? \` The current focus claim is: \${escapeHtml(selectedForAutomation.claim.claimText)}\` : ""}</span>
        </div>
      \`;
    }

    function renderAssessmentMeaning(assessment, input) {
      const summary = document.getElementById("assessmentMeaning");
      const checklist = document.getElementById("assessmentChecklist");
      if (!summary || !checklist) return;

      const evidence = evidenceBreakdown(input.evidence || []);
      const releaseTone = assessment.releaseState === "hold" ? "danger" : assessment.releaseState === "review_required" ? "warning" : "";
      summary.className = \`status-note \${releaseTone}\`.trim();
      summary.textContent =
        \`Veritas currently reads this claim as \${humanLabel(assessment.truthState).toLowerCase()} with a \${pct(assessment.posteriorTruthScore)}% truth score. \${releaseGateMeaning(assessment.releaseState)}\`;

      const rationale = Array.isArray(assessment.explanation?.releaseRationale)
        ? assessment.explanation.releaseRationale.slice(0, 2)
        : [];

      checklist.innerHTML = \`
        <li>\${escapeHtml(truthStateMeaning(assessment.truthState))}</li>
        <li>\${evidence.supporting} supporting quote(s), \${evidence.contradicting} contradicting quote(s), and \${evidence.contextual} context-only quote(s) are attached to this claim.</li>
        <li>\${escapeHtml(releaseGateMeaning(assessment.releaseState))}</li>
        \${rationale.map((line) => \`<li>\${escapeHtml(line)}</li>\`).join("")}
      \`;
    }

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

    function savedRoleMode() {
      const value = localStorage.getItem(ROLE_MODE_STORAGE);
      return ["analyst", "reviewer", "admin"].includes(String(value)) ? value : "analyst";
    }

    function roleLabel(role) {
      return ({
        analyst: "Analyst",
        reviewer: "Reviewer",
        admin: "Admin",
      }[role] || "Analyst");
    }

    function setRoleMode(role, options = {}) {
      if (!["analyst", "reviewer", "admin"].includes(String(role))) return;
      localStorage.setItem(ROLE_MODE_STORAGE, role);
      renderHomeHub();
      renderRoleModePanels();
      updateWorkflowStatus();
      if (!options.silent) {
        showMessage(roleLabel(role) + " mode saved for this browser.");
      }
    }

    function applyRoleNote(target, tone, message) {
      if (!target) return;
      target.className = ("status-note role-brief" + (tone ? " " + tone : "")).trim();
      target.textContent = message;
    }

    function setRolePanelState(panel, state) {
      if (!panel) return;
      panel.classList.remove("role-focused", "role-softened");
      if (state) {
        panel.classList.add(state);
      }
    }

    function renderRoleAwareControls(roleMode) {
      [
        ingestInputPanel,
        ingestOutputPanel,
        assessAdvancedPanel,
        assessPrimaryPanel,
        reviewActionPanel,
        reviewGuidePanel,
        reportDecisionPanel,
        reportTechnicalPanel,
        adminControlPanel,
        adminGovernancePanel,
      ].forEach((panel) => setRolePanelState(panel, ""));

      let focusedPanels = [ingestInputPanel, ingestOutputPanel, assessPrimaryPanel, reportDecisionPanel];
      let softenedPanels = [assessAdvancedPanel, reviewActionPanel, reviewGuidePanel, reportTechnicalPanel, adminControlPanel, adminGovernancePanel];
      let ingestLabel = "Ingest source";
      let automatedLabel = "Run guided intake";
      let assessLabel = "Assess claim";
      let exportLabel = "Build release PDF";
      let resetLabel = "Reset sample";
      let advancedDetailsOpen = false;

      if (roleMode === "reviewer") {
        focusedPanels = [assessPrimaryPanel, reviewActionPanel, reviewGuidePanel, reportDecisionPanel];
        softenedPanels = [ingestInputPanel, ingestOutputPanel, assessAdvancedPanel, reportTechnicalPanel, adminControlPanel, adminGovernancePanel];
        ingestLabel = "Load source context";
        automatedLabel = "Run full workflow";
        assessLabel = "Re-check claim";
        exportLabel = "Build review PDF";
      } else if (roleMode === "admin") {
        focusedPanels = [reportDecisionPanel, reportTechnicalPanel, adminControlPanel, adminGovernancePanel];
        softenedPanels = [ingestInputPanel, ingestOutputPanel, assessAdvancedPanel, reviewActionPanel, reviewGuidePanel];
        ingestLabel = "Monitor intake";
        automatedLabel = "Run monitored workflow";
        assessLabel = "Run diagnostic assessment";
        exportLabel = "Build governance PDF";
        resetLabel = "Reset diagnostic sample";
        advancedDetailsOpen = true;
      }

      focusedPanels.forEach((panel) => setRolePanelState(panel, "role-focused"));
      softenedPanels.forEach((panel) => setRolePanelState(panel, "role-softened"));

      if (ingestAdvancedDetails) {
        ingestAdvancedDetails.open = advancedDetailsOpen;
      }
      if (ingestButton) {
        ingestButton.textContent = ingestLabel;
      }
      if (automatedTruthRunIngestButton) {
        automatedTruthRunIngestButton.textContent = automatedLabel;
      }
      if (automatedTruthRunButton) {
        automatedTruthRunButton.textContent = automatedLabel;
      }
      if (runButton) {
        runButton.textContent = assessLabel;
      }
      if (resetButton) {
        resetButton.textContent = resetLabel;
      }
      if (exportButton) {
        exportButton.textContent = exportLabel;
      }
    }

    function renderRoleModePanels() {
      const roleMode = savedRoleMode();
      renderRoleAwareControls(roleMode);
      if (roleMode === "analyst") {
        applyRoleNote(roleIngestNote, "", "Analyst focus: bring in source material, confirm the right claim is being checked, and keep the workflow moving toward findings and reports.");
        applyRoleNote(roleAssessNote, "", "Analyst focus: use this page to judge evidence strength, understand the release gate, and decide whether the work is ready to move forward.");
        applyRoleNote(roleReviewNote, "warning", "Analyst view: review is only needed when Veritas flags risk. If work appears here, coordinate with the assigned reviewer and keep release blocked until a decision is recorded.");
        applyRoleNote(roleReportNote, "", "Analyst focus: use reports after the gate is clear, or prepare restricted internal outputs only when public release remains blocked.");
        applyRoleNote(roleAdminNote, "", "Analyst view: Admin is mainly for environment setup and corporate controls. Most daily work should stay in Intake, Findings, and Reports.");
        return;
      }

      if (roleMode === "reviewer") {
        applyRoleNote(roleIngestNote, "warning", "Reviewer view: Intake is usually reference material for you. Use it when you need the original source context behind a flagged review decision.");
        applyRoleNote(roleAssessNote, "", "Reviewer focus: inspect the evidence and release gate here before approving, holding, rejecting, or escalating a claim.");
        applyRoleNote(roleReviewNote, "warning", "Reviewer focus: this is your primary workspace. Resolve flagged tasks with the smallest correct decision and leave notes whenever the claim is not approved.");
        applyRoleNote(roleReportNote, "", "Reviewer view: use Reports to confirm what remains blocked, what can move forward, and whether only restricted internal reporting is allowed.");
        applyRoleNote(roleAdminNote, "", "Reviewer view: Admin is not your main workspace, but it can help you confirm tenant context, protected access posture, and audit visibility when needed.");
        return;
      }

      applyRoleNote(roleIngestNote, "", "Admin view: Intake shows what analysts are feeding into the system. Use it for oversight and spot checks rather than routine daily processing.");
      applyRoleNote(roleAssessNote, "", "Admin view: Findings are useful for spot-checking quality and release posture, but they are not the main governance workspace.");
      applyRoleNote(roleReviewNote, "warning", "Admin focus: monitor the review queue when work is blocking release, make sure the right reviewer coverage exists, and keep governance aligned with the queue state.");
      applyRoleNote(roleReportNote, "", "Admin focus: use Reports to monitor what can be distributed, what must stay restricted, and what remains blocked by policy or review.");
      applyRoleNote(roleAdminNote, "", "Admin focus: this is your main workspace for protected access, tenant operations, user management, audit history, repository health, and operational governance.");
    }

    function accessStatusDetails() {
      const key = savedApiKey();
      if (!apiKeyRequired) {
        return {
          label: "Signed in local session",
          startMessage: currentAuthUser.displayName + " is signed in. This browser can use the workspace without an extra shared key.",
          tone: "",
        };
      }
      if (key) {
        return {
          label: "Signed in session with shared key saved",
          startMessage: currentAuthUser.displayName + " is signed in, and this browser also has the shared access key saved for local API use.",
          tone: "",
        };
      }
      return {
        label: "Signed in session active",
        startMessage: currentAuthUser.displayName + " is signed in. The shared access key is optional here and only needed for direct API or script access outside this session.",
        tone: "",
      };
    }

    function routeForSection(sectionId) {
      return ({
        start: "/start",
        ingest: "/ingest",
        assess: "/results",
        review: "/review",
        dossier: "/report",
        enterprise: "/settings",
      }[sectionId] || "/start");
    }

    function navigateToSection(sectionId) {
      window.location.assign(routeForSection(sectionId));
    }

    function savedPayload() {
      return localStorage.getItem(PAYLOAD_STORAGE) || JSON.stringify(sampleInput, null, 2);
    }

    function persistPayload(value) {
      localStorage.setItem(PAYLOAD_STORAGE, value);
    }

    function persistDocumentDraft() {
      localStorage.setItem(DOC_DRAFT_STORAGE, JSON.stringify({
        title: docTitle.value,
        mimeType: docMime.value,
        content: docContent.value,
        publicImpact: docPublicImpact.checked,
      }));
    }

    function restoreDocumentDraft() {
      try {
        const raw = localStorage.getItem(DOC_DRAFT_STORAGE);
        if (!raw) return;
        const draft = JSON.parse(raw);
        docTitle.value = draft.title || docTitle.value;
        docMime.value = draft.mimeType || docMime.value;
        docContent.value = draft.content || docContent.value;
        docPublicImpact.checked = draft.publicImpact ?? docPublicImpact.checked;
      } catch {
        // Ignore malformed local state.
      }
    }

    function updateApiKeyUi() {
      const key = savedApiKey();
      const access = accessStatusDetails();
      apiKeyInput.value = key;
      apiKeyStatus.value = access.label;
      if (quickAccessSummary) {
        quickAccessSummary.className = (access.tone ? "status-note " + access.tone : "status-note").trim();
        quickAccessSummary.textContent = access.startMessage;
      }
      renderHomeHub();
      renderRoleModePanels();
    }

    function renderHomeHub() {
      const roleMode = savedRoleMode();
      const releaseBlocked = String(workflow.releaseRecommendation).toLowerCase().includes("do not release");
      const releaseLabel = !workflow.releaseRecommendation
        ? "Awaiting first run"
        : releaseBlocked
          ? "Blocked for release"
          : workflow.openReviews > 0
            ? "Needs review"
            : "Ready for controlled use";

      if (homeIngestionCount) homeIngestionCount.textContent = String(workflow.ingestions);
      if (homeJobCount) homeJobCount.textContent = String(workflow.jobs);
      if (homeReviewCount) homeReviewCount.textContent = String(workflow.openReviews);
      if (homeReleaseStatus) homeReleaseStatus.textContent = releaseLabel;

      document.querySelectorAll("[data-role-card]").forEach((card) => {
        card.classList.toggle("selected", card.getAttribute("data-role-card") === roleMode);
      });
      if (homeAnalystRoleNote) homeAnalystRoleNote.textContent = roleMode === "analyst" ? "Current role mode" : "Role workspace";
      if (homeReviewerRoleNote) homeReviewerRoleNote.textContent = roleMode === "reviewer" ? "Current role mode" : "Role workspace";
      if (homeAdminRoleNote) homeAdminRoleNote.textContent = roleMode === "admin" ? "Current role mode" : "Role workspace";

      if (homeAnalystSummary) {
        homeAnalystSummary.textContent = workflow.ingestions
          ? workflow.openReviews > 0
            ? "Daily work has " + workflow.openReviews + " flagged review task(s). The next best step is to open the review queue before reporting anything outward."
            : "Daily work is in good shape. " + workflow.ingestions + " source record(s) are available, and the next best step is to inspect findings or move into reports."
          : "Daily work is ready for the first source. Open Intake, add one document, and let Veritas carry it through the guided flow.";
      }

      if (homeReviewerSummary) {
        homeReviewerSummary.textContent = workflow.openReviews > 0
          ? "There are " + workflow.openReviews + " review task(s) waiting. " + (workflow.nextTask?.title ? "Next flagged task: " + workflow.nextTask.title + "." : "Open the review queue and clear the highest-risk claim first.")
          : "No review work is waiting right now. Reviewers only need to step in when Veritas flags uncertainty, contradiction, or public-impact risk.";
      }

      if (homeAdminSummary) {
        homeAdminSummary.textContent = adminSnapshot.tenantName + " is the active tenant. Repository mode is " + adminSnapshot.repositoryMode + ". " + adminSnapshot.userCount + " user(s) are visible in this tenant, and integration posture is " + adminSnapshot.integrationMode + ".";
      }
    }

    async function saveApiKeyFromInput(input) {
      const key = input.value.trim();
      if (key) {
        localStorage.setItem(API_KEY_STORAGE, key);
      } else {
        localStorage.removeItem(API_KEY_STORAGE);
      }
      updateApiKeyUi();
      renderHomeHub();
      await boot().catch((error) => showMessage(error.message, "danger"));
    }

    function showMessage(message, tone = "info") {
      const target = document.getElementById("appMessage");
      target.textContent = message;
      target.className = \`visible \${tone}\`;
      window.clearTimeout(showMessage.timeout);
      showMessage.timeout = window.setTimeout(() => {
        target.className = "";
      }, tone === "danger" ? 9000 : 5200);
    }

    async function readJsonResponse(response, fallbackMessage) {
      const text = await response.text();
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || fallbackMessage);
      }

      if (!response.ok || json.ok === false) {
        const details = json.remediation ? \` \${json.remediation}\` : "";
        throw new Error((json.error || fallbackMessage) + details);
      }

      return json;
    }

    async function apiJson(url, options = {}, fallbackMessage = "Request failed") {
      return readJsonResponse(await apiFetch(url, options), fallbackMessage);
    }

    function setNextAction(label, sectionId, tone = "") {
      if (!nextActionButton) return;
      nextActionButton.textContent = \`Next: \${label}\`;
      nextActionButton.setAttribute("href", routeForSection(sectionId));
      nextActionButton.className = \`button secondary workflow-next \${tone}\`.trim();
    }

    function setWorkflowLinkState(sectionId, state) {
      document.querySelectorAll(\`[data-workflow-link="\${sectionId}"]\`).forEach((link) => {
        link.classList.remove("complete", "pending", "blocked");
        if (state) link.classList.add(state);
      });
    }

    function updateWorkflowNavigator() {
      const releaseBlocked = String(workflow.releaseRecommendation).toLowerCase().includes("do not release");
      setWorkflowLinkState("start", workflow.ingestions > 0 ? "complete" : "pending");
      setWorkflowLinkState("ingest", workflow.ingestions > 0 ? "complete" : "pending");
      setWorkflowLinkState("assess", workflow.ingestions > 0 ? "complete" : "");

      if (workflow.openReviews > 0) {
        setWorkflowLinkState("review", "pending");
        setWorkflowLinkState("dossier", "blocked");
      } else {
        setWorkflowLinkState("review", workflow.ingestions > 0 ? "complete" : "");
        setWorkflowLinkState("dossier", releaseBlocked ? "blocked" : workflow.ingestions > 0 ? "pending" : "");
      }
    }

    function setActiveSection(sectionId) {
      if (!sectionId) return;
      document.querySelectorAll("[data-nav-link], [data-workflow-link]").forEach((link) => {
        const navTarget = link.getAttribute("data-nav-link") || link.getAttribute("data-workflow-link");
        link.classList.toggle("active", navTarget === sectionId);
      });
    }

    function initializeNavigationObservers() {
      setActiveSection(currentPage || "start");
    }

    function updateWorkflowStatus() {
      const target = document.getElementById("workflowStatus");
      const instruction = document.getElementById("workflowInstruction");
      if (!target) return;
      updateWorkflowNavigator();
      renderHomeHub();
      const roleMode = savedRoleMode();

      if (workflow.automationRunning) {
        target.className = "status-note warning";
        target.textContent = "Automated truth workflow is running: ingesting evidence, selecting the highest-risk claim, scoring it, refreshing review, and checking dossier readiness.";
        setNextAction("Wait for automation", "start", "pending");
        if (instruction) {
          instruction.className = "status-note";
          instruction.textContent = "Human input is paused while automation runs. Wait for Veritas to tell you whether review is required.";
        }
        return;
      }

      if (!workflow.ingestions) {
        target.className = roleMode === "admin" ? "status-note warning" : "status-note";
        target.textContent = roleMode === "admin"
          ? "No source work has started yet. Admin can configure the environment now or wait for analyst intake."
          : roleMode === "reviewer"
            ? "No source work has started yet. Reviewers usually wait for flagged work after intake begins."
            : "Ready for a source document. Open Intake first.";
        setNextAction(
          roleMode === "admin" ? "Open admin" : roleMode === "reviewer" ? "Open review queue" : "Open intake",
          roleMode === "admin" ? "enterprise" : roleMode === "reviewer" ? "review" : "ingest"
        );
        if (instruction) {
          instruction.className = "status-note";
          instruction.textContent = roleMode === "admin"
            ? "Suggested admin action: confirm protected access, the active tenant, and the user roster so the environment is ready for daily work."
            : roleMode === "reviewer"
              ? "Reviewer action is not needed yet. Wait for Veritas to flag uncertainty, contradiction, or public-impact risk."
              : "Required human input: provide one source document or pasted text. No judgment call is needed yet.";
        }
        return;
      }

      if (workflow.openReviews > 0) {
        setNextAction(roleMode === "admin" ? "Check review queue" : "Resolve review queue", "review", "pending");
        target.className = "status-note warning";
        target.textContent = roleMode === "admin"
          ? \`\${workflow.openReviews} review task(s) are blocking release. Admin should monitor the queue and release posture.\`
          : \`\${workflow.openReviews} review task(s) need attention before public release. Open Review next.\`;
        if (instruction) {
          const nextTitle = workflow.nextTask?.title ? \` Next flagged task: \${workflow.nextTask.title}.\` : "";
          instruction.className = "status-note warning";
          instruction.textContent = roleMode === "admin"
            ? "Suggested admin action: make sure the correct reviewer coverage is in place and keep blocked release outputs under control." + nextTitle
            : "Required human input: inspect the flagged claim, choose Approve, Hold, Reject, or Escalate, and add notes for any non-approval decision." + nextTitle;
        }
        return;
      }

      if (String(workflow.releaseRecommendation).toLowerCase().includes("do not release")) {
        target.className = "status-note danger";
        target.textContent = workflow.releaseRecommendation;
        setNextAction(roleMode === "admin" ? "Open admin" : "Review blocked claims", roleMode === "admin" ? "enterprise" : "review", "blocked");
        if (instruction) {
          instruction.className = "status-note danger";
          instruction.textContent = roleMode === "admin"
            ? "Suggested admin action: keep external release blocked, confirm governance posture, and monitor any restricted internal reporting."
            : "Required human input: do not export publicly. Either resolve the remaining issues in Review or use a restricted internal dossier only.";
        }
        return;
      }

      target.className = "status-note";
      target.textContent = roleMode === "admin"
        ? "The environment has live records and no active review block. Admin can confirm governance posture or check reporting outputs."
        : roleMode === "reviewer"
          ? "No review block is active right now. Reviewers can inspect findings or stand by for the next flagged decision."
          : "Live records are available. Check the dossier recommendation before exporting.";
      setNextAction(
        roleMode === "admin" ? "Open admin" : roleMode === "reviewer" ? "Open findings" : "Open reports",
        roleMode === "admin" ? "enterprise" : roleMode === "reviewer" ? "assess" : "dossier"
      );
      if (instruction) {
        instruction.className = "status-note";
        instruction.textContent = roleMode === "admin"
          ? "Suggested admin action: review tenant state, audit posture, and release controls before wider distribution."
          : roleMode === "reviewer"
            ? "Reviewer work is optional right now. You can inspect the findings, but no human decision is currently blocking release."
            : "Minimal human input: verify the release recommendation, then export only the allowed report or dossier artifact.";
      }
    }

    function reviewDecisionHelp(decision) {
      return ({
        approved: "Approve when the evidence and source binding are sufficient for this claim.",
        needs_changes: "Hold when the claim needs correction, clarification, or more evidence before release.",
        rejected: "Reject when the current evidence does not support the claim.",
        deferred: "Escalate when specialist review is needed and you cannot safely clear the claim now.",
      }[decision] || "Choose the smallest valid review decision.");
    }

    function currentReviewer() {
      return reviewerName.value.trim() || "local_reviewer";
    }

    function reviewNotesRequired(decision) {
      return ["needs_changes", "rejected", "deferred"].includes(decision);
    }

    function updateReviewerInstructionStatus() {
      reviewerInstructionStatus.value = workflow.openReviews > 0
        ? \`Review required: \${workflow.openReviews} active task(s)\`
        : "No human action required yet";
    }

    function updateReviewInstructionList(snapshot) {
      const target = document.getElementById("reviewInstructionList");
      if (!target) return;
      const nextTask = (snapshot.openTasks || [])[0] || (snapshot.inReviewTasks || [])[0] || null;
      workflow.nextTask = nextTask;

      if (!nextTask) {
        target.innerHTML = \`
          <div class="instruction-card">
            <strong>No review work is blocking release.</strong>
            <span>Automation is handling the current flow. Add another source or continue to the dossier recommendation.</span>
          </div>
          <div class="instruction-card">
            <strong>Human input is optional right now.</strong>
            <span>You can inspect evidence manually, but no approval decision is currently required.</span>
          </div>
        \`;
        updateWorkflowStatus();
        updateReviewerInstructionStatus();
        return;
      }

      const reasons = Array.isArray(nextTask.payload?.reasons) ? nextTask.payload.reasons.join(", ") : "review_required";
      target.innerHTML = \`
        <div class="instruction-card">
          <strong>Next required task: \${escapeHtml(nextTask.title)}</strong>
          <span>\${escapeHtml(nextTask.summary)}</span>
        </div>
        <div class="instruction-card">
          <strong>What the human must check</strong>
          <span>Read the evidence, verify whether the claim should be cleared, corrected, rejected, or escalated. Trigger reason(s): \${escapeHtml(reasons)}.</span>
        </div>
        <div class="instruction-card">
          <strong>What input is required</strong>
          <span>Reviewer name is always required. Notes are required only for Hold, Reject, and Escalate.</span>
        </div>
      \`;
      updateWorkflowStatus();
      updateReviewerInstructionStatus();
    }

    function claimRiskScore(item) {
      const releaseWeight = item.assessment.releaseState === "hold" ? 100 : item.assessment.releaseState === "review_required" ? 70 : 0;
      const truthUncertainty = 1 - Math.abs(Number(item.assessment.posteriorTruthScore || 0.5) - 0.5) * 2;
      const contradiction = Number(item.assessment.features?.contradictionPressure || 0);
      const supportGap = 1 - Number(item.assessment.features?.evidenceSupport || 0);
      return releaseWeight + contradiction * 20 + supportGap * 10 + truthUncertainty * 10;
    }

    function selectAutomationClaim(result) {
      return [...(result.claimPackages || [])].sort((a, b) => claimRiskScore(b) - claimRiskScore(a))[0] || null;
    }

    async function apiFetch(url, options = {}) {
      const key = savedApiKey();
      const headers = new Headers(options.headers || {});
      if (key) headers.set("x-veritas-api-key", key);
      const response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        apiKeyStatus.value = "Protected local mode: saved access key is missing or invalid";
        if (quickAccessSummary) {
          quickAccessSummary.className = "status-note warning";
          quickAccessSummary.textContent = "Protected local mode is enabled, but this browser does not have a working shared access key yet.";
        }
        throw new Error("Access key required or invalid. Open Settings > System access and save the shared access key.");
      }
      return response;
    }

    function renderFeatures(features) {
      const target = document.getElementById("features");
      target.innerHTML = Object.entries(features).map(([key, value]) => \`
        <div class="feature-row">
          <strong>\${featureLabels[key] || titleCase(key)}</strong>
          <span class="bar" style="--value:\${pct(value)}%"><i></i></span>
          <span>\${pct(value)}%</span>
        </div>
      \`).join("");
    }

    function renderEvidence(input) {
      const target = document.getElementById("evidence");
      target.innerHTML = input.evidence.map(({ span, source }) => \`
        <div class="evidence-item">
          <span class="tag \${safeClass(span.evidenceRole)}">\${escapeHtml(humanLabel(span.evidenceRole))}</span>
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
      document.getElementById("truthState").textContent = humanLabel(assessment.truthState);
      document.getElementById("releaseState").textContent = humanLabel(assessment.releaseState);
      renderAssessmentMeaning(assessment, input);
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
          <small>Assigned to: \${escapeHtml(task.assignedTo || "unassigned")}</small>
          <div class="task-actions">
            \${task.payload?.claimId ? \`<button class="mini-button" data-load-claim="\${task.id}">Open claim</button>\` : ""}
            \${task.status === "open" ? \`<button class="mini-button" data-review="\${task.id}" data-decision="start_review">Start</button>\` : ""}
            \${task.status !== "resolved" ? \`
              <button class="mini-button" data-review="\${task.id}" data-decision="approved">Approve</button>
              <button class="mini-button" data-review="\${task.id}" data-decision="needs_changes">Hold</button>
              <button class="mini-button" data-review="\${task.id}" data-decision="rejected">Reject</button>
              <button class="mini-button" data-review="\${task.id}" data-decision="deferred">Escalate</button>
            \` : ""}
          </div>
        </div>
      \`).join("") : '<div class="task"><span>No tasks in this lane. Ingest public-impact material to create review work, or continue to Dossier if the release gate is clear.</span></div>';
    }

    function renderReviewer(snapshot) {
      workflow.openReviews = (snapshot.openTasks || []).length + (snapshot.inReviewTasks || []).length;
      updateReviewInstructionList(snapshot);
      renderTasks("openTasks", snapshot.openTasks || []);
      renderTasks("inReviewTasks", snapshot.inReviewTasks || []);
      renderTasks("resolvedTasks", snapshot.resolvedTasks || []);
      document.querySelectorAll("[data-review]").forEach((button) => {
        button.addEventListener("click", async () => {
          await applyReviewAction(button.getAttribute("data-review"), button.getAttribute("data-decision"));
        });
      });
      document.querySelectorAll("[data-load-claim]").forEach((button) => {
        button.addEventListener("click", async () => {
          const taskId = button.getAttribute("data-load-claim");
          const task = [...(snapshot.openTasks || []), ...(snapshot.inReviewTasks || []), ...(snapshot.resolvedTasks || [])]
            .find((item) => item.id === taskId);
          const assessment = task?.payload?.assessment;
          const evidence = task?.payload?.evidence;
          const claimId = task?.payload?.claimId;
          if (!assessment || !Array.isArray(evidence) || !claimId) {
            showMessage("This review task does not include a claim package preview.", "warning");
            return;
          }
          const claimText = task?.title?.replace(/^Review claim:\s*/i, "") || "Flagged claim";
          payloadEl.value = JSON.stringify({
            claim: {
              id: claimId,
              claimText,
              subject: null,
              predicate: "requires_review",
              object: null,
              polarity: "affirmed",
              modality: "asserted_fact",
              canonicalFingerprint: claimId,
              publicImpact: true,
            },
            evidence,
            claimRelations: [],
            sourceLineage: [],
            causalLinks: [],
          }, null, 2);
          persistPayload(payloadEl.value);
          if (currentPage !== "assess") {
            navigateToSection("assess");
            return;
          }
          await runAssessment();
        });
      });
    }

    function renderDossier(dossier) {
      workflow.releaseRecommendation = dossier.releaseRecommendation || "";
      updateWorkflowStatus();
      const blocked = String(dossier.releaseRecommendation || "").toLowerCase().includes("do not release");
      document.getElementById("dossierSummary").innerHTML = \`
        <p><strong>\${dossier.metadata.title}</strong></p>
        <p>Release recommendation: <span class="tag contextual">\${dossier.releaseRecommendation}</span></p>
        <p>Records: \${dossier.records.length}</p>
        <p><strong>Human action:</strong> \${blocked ? "Do not export publicly. Resolve review tasks or use restricted internal distribution only." : "Confirm the recommendation, then export the allowed artifact."}</p>
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

    async function renderIngestResult(result, options = {}) {
      const selectedForAutomation = options.automated ? selectAutomationClaim(result) : result.claimPackages[0];
      renderProcessingExplainer(result, selectedForAutomation, options);
      showMessage(
        options.automated
          ? \`Automated run ingested "\${result.document.title}", extracted \${result.claimPackages.length} claim package(s), and selected the highest-risk claim.\`
          : \`Ingested "\${result.document.title}" and extracted \${result.claimPackages.length} claim package(s).\`
      );
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
            <small>\${humanLabel(item.assessment.truthState)} · \${humanLabel(item.assessment.releaseState)} · evidence confidence \${pct(item.candidate.confidence)}%</small>
          </button>
        \`).join("")
        : '<div class="task"><span>No atomic claims were extracted. Add declarative sentences with dates, actors, or actions.</span></div>';

      document.querySelectorAll("[data-claim-index]").forEach((button) => {
        button.addEventListener("click", async () => {
          const selected = result.claimPackages[Number(button.getAttribute("data-claim-index"))];
          payloadEl.value = JSON.stringify(selected.claimPackage, null, 2);
          persistPayload(payloadEl.value);
          if (currentPage !== "assess") {
            navigateToSection("assess");
            return;
          }
          await runAssessment();
        });
      });

      if (selectedForAutomation) {
        payloadEl.value = JSON.stringify(selectedForAutomation.claimPackage, null, 2);
        persistPayload(payloadEl.value);
        await runAssessment();
      }
      await Promise.all([refreshHistory(), refreshJobs(), refreshReviewer(), refreshDossier(), refreshEnterprise()]);
      if (options.automated) {
        navigateToSection(workflow.openReviews > 0 ? "review" : "dossier");
        return;
      }
    }

    function renderHistory(history) {
      const items = history.ingestions || [];
      workflow.ingestions = history.total || items.length;
      updateWorkflowStatus();
      document.getElementById("historyList").innerHTML = items.length ? items.map((item, index) => \`
        <div class="history-item">
          <strong>\${item.document.title}</strong>
          <span style="color:var(--muted);font-size:13px">\${new Date(item.createdAt).toLocaleString()} · \${item.document.mimeType} · \${item.claimCount} claim(s) · \${item.reviewCount} review gate(s)</span>
          <div class="task-actions">
            <button class="mini-button" data-history-index="\${index}">Load first claim</button>
            <button class="mini-button" data-history-document="\${item.document.id}">Inspect document</button>
          </div>
        </div>
      \`).join("") : '<div class="task"><span>No saved ingestions match the current filters. Adjust the search controls or ingest a new document.</span></div>';

      document.querySelectorAll("[data-history-index]").forEach((button) => {
        button.addEventListener("click", async () => {
          const item = items[Number(button.getAttribute("data-history-index"))];
          const first = item?.claimPackages?.[0];
          if (!first) return;
          payloadEl.value = JSON.stringify(first.claimPackage, null, 2);
          persistPayload(payloadEl.value);
          if (currentPage !== "assess") {
            navigateToSection("assess");
            return;
          }
          await runAssessment();
        });
      });

      document.querySelectorAll("[data-history-document]").forEach((button) => {
        button.addEventListener("click", async () => {
          const documentId = button.getAttribute("data-history-document");
          const result = await apiFetch("/api/ingestion-history/" + encodeURIComponent(documentId)).then((res) => res.json());
          const first = result.ingestion?.claimPackages?.[0];
          if (!first) {
            showMessage("This document does not contain a claim package yet.", "warning");
            return;
          }
          docTitle.value = result.ingestion.document.title || "";
          docMime.value = result.ingestion.document.mimeType || "text/plain";
          docContent.value = result.ingestion.document.contentText || "";
          persistDocumentDraft();
          document.getElementById("ingestSummary").textContent = JSON.stringify({
            document: result.ingestion.document,
            source: result.ingestion.source,
            createdAt: result.ingestion.createdAt,
            claimCount: result.ingestion.claimCount,
            reviewCount: result.ingestion.reviewCount,
          }, null, 2);
          payloadEl.value = JSON.stringify(first.claimPackage, null, 2);
          persistPayload(payloadEl.value);
          if (currentPage !== "ingest") {
            navigateToSection("ingest");
            return;
          }
          showMessage("Loaded document details and the first claim package from history.");
        });
      });
    }

    function renderJobs(jobsPayload) {
      const jobs = jobsPayload.jobs || [];
      workflow.jobs = jobsPayload.total || jobs.length;
      renderHomeHub();
      document.getElementById("jobList").innerHTML = jobs.length ? jobs.slice(0, 12).map((job) => \`
        <div class="job-item \${job.status}">
          <strong>\${job.title}</strong>
          <span style="color:var(--muted);font-size:13px">\${job.type} · \${job.status} · \${new Date(job.createdAt).toLocaleString()}</span>
          <span class="progress" style="--value:\${job.progress}%"><i></i></span>
          \${job.result ? \`<small>\${JSON.stringify(job.result)}</small>\` : ""}
          \${job.error ? \`<small style="color:var(--red)">\${job.error}</small>\` : ""}
        </div>
      \`).join("") : '<div class="task"><span>No processing jobs yet. Ingest a document to create the first processing job.</span></div>';
    }

    function renderEnterprise(state, audit, diagnostics, integrationsPayload) {
      adminSnapshot = {
        tenantName: state.activeTenant?.name || "No active tenant",
        repositoryMode: diagnostics.mode || "unknown",
        userCount: Array.isArray(state.users) ? state.users.length : 0,
        integrationMode: integrationsPayload.standalone ? "standalone" : "external",
      };
      renderHomeHub();
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
      document.getElementById("enterpriseSummary").textContent =
        \`Repository: \${diagnostics.mode} mode. Active tenant: \${state.activeTenant.name}. Open reviews: \${state.metrics.openReviews}. Running jobs: \${state.metrics.runningJobs}.\`;
      const integrations = integrationsPayload.integrations || [];
      document.getElementById("integrationSummary").textContent =
        integrationsPayload.standalone
          ? \`Standalone mode is active. \${integrations.length} integration boundary slot(s) are registered and \${integrationsPayload.enabledCount} are enabled.\`
          : \`External integration mode is active. \${integrationsPayload.enabledCount} integration adapter(s) are enabled.\`;
      document.getElementById("integrationList").innerHTML = integrations.length ? integrations.map((integration) => \`
        <div class="history-item">
          <strong>\${integration.name}</strong>
          <span style="color:var(--muted);font-size:13px">\${integration.lifecycle} lifecycle · \${integration.direction} · \${integration.health.status}</span>
          <small>\${integration.description}</small>
          <small style="color:var(--muted)">\${integration.health.summary}</small>
        </div>
      \`).join("") : '<div class="task"><span>No external integration adapters are registered.</span></div>';

      tenantSelect.innerHTML = state.tenants.map((tenant) => \`
        <option value="\${tenant.id}" \${tenant.id === state.activeTenant.id ? "selected" : ""}>\${tenant.name} · \${tenant.region} · \${tenant.plan}</option>
      \`).join("");

      const canRemoveUsers = state.users.length > 1;
      document.getElementById("userList").innerHTML = state.users.length ? state.users.map((user) => \`
        <div class="history-item">
          <strong>\${user.displayName}</strong>
          <span style="color:var(--muted);font-size:13px">\${user.email} · \${titleCase(user.role)} · \${user.status}\${user.id === state.activeUser.id ? " · active now" : ""}</span>
          <div class="task-actions">
            <button class="mini-button" data-remove-user="\${user.id}" \${canRemoveUsers ? "" : "disabled"}>\${user.id === state.activeUser.id ? "Remove active user" : "Remove user"}</button>
          </div>
        </div>
      \`).join("") : '<div class="task"><span>No users in this tenant.</span></div>';

      document.querySelectorAll("[data-remove-user]").forEach((button) => {
        button.addEventListener("click", async () => {
          const userId = button.getAttribute("data-remove-user");
          const user = state.users.find((item) => item.id === userId);
          if (!user) return;
          const label = user.displayName || user.email;
          const confirmed = window.confirm(\`Remove \${label} from the active tenant?\`);
          if (!confirmed) return;
          try {
            await apiJson("/api/remove-user", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ userId }),
            }, "User removal failed");
            showMessage(\`\${label} removed from the active tenant.\`);
            await refreshEnterprise();
          } catch (error) {
            showMessage(error.message, "danger");
          }
        });
      });

      document.getElementById("auditList").innerHTML = (audit.auditLog || []).slice(0, 50).map((entry) => \`
        <div class="audit-item">
          <strong>\${entry.action}</strong>
          <span>\${entry.summary}</span>
          <small>\${new Date(entry.createdAt).toLocaleString()} · \${entry.actorEmail} · \${entry.resourceType}:\${entry.resourceId}</small>
        </div>
      \`).join("") || '<div class="task"><span>No audit events yet.</span></div>';
    }

    async function refreshEnterprise() {
      const [state, audit, diagnostics, integrations] = await Promise.all([
        apiFetch("/api/enterprise-state").then((res) => res.json()),
        apiFetch("/api/audit-log").then((res) => res.json()),
        apiFetch("/api/repository-diagnostics").then((res) => res.json()),
        apiFetch("/api/integrations").then((res) => res.json()),
      ]);
      renderEnterprise(state, audit, diagnostics, integrations);
    }

    async function refreshHistory() {
      const params = new URLSearchParams();
      if (historySearch.value.trim()) params.set("q", historySearch.value.trim());
      if (historyReleaseState.value !== "any") params.set("releaseState", historyReleaseState.value);
      if (historyMimeType.value !== "any") params.set("mimeType", historyMimeType.value);
      if (historyPublicImpact.value !== "any") params.set("publicImpact", historyPublicImpact.value);
      const query = params.toString();
      const history = await apiFetch("/api/ingestion-history" + (query ? "?" + query : "")).then((res) => res.json());
      renderHistory(history);
    }

    async function refreshJobs() {
      const params = new URLSearchParams();
      if (jobSearch.value.trim()) params.set("q", jobSearch.value.trim());
      if (jobStatus.value !== "any") params.set("status", jobStatus.value);
      if (jobType.value !== "any") params.set("type", jobType.value);
      const query = params.toString();
      const jobs = await apiFetch("/api/jobs" + (query ? "?" + query : "")).then((res) => res.json());
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
      const reviewer = currentReviewer();
      const notes = reviewNotes.value.trim();
      if (!reviewer) {
        showMessage("Reviewer name is required before recording a review action.", "danger");
        reviewerName.focus();
        return;
      }
      if (reviewNotesRequired(decision) && !notes) {
        showMessage(reviewDecisionHelp(decision) + " Add review notes before submitting this action.", "warning");
        reviewNotes.focus();
        return;
      }
      const result = await apiJson("/api/review-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId, decision, reviewer, notes: notes || undefined }),
      }, "Review action failed");
      if (decision !== "start_review") {
        reviewNotes.value = "";
      }
      showMessage(decision === "start_review" ? "Review started. Veritas is waiting for your decision." : "Review action saved.");
      renderReviewer(result.snapshot);
      await refreshDossier();
      await refreshEnterprise();
    }

    async function buildDocumentRequestBody() {
      const file = docFile.files && docFile.files[0];
      persistDocumentDraft();
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
          persistDocumentDraft();
        }
        docMime.value = body.mimeType;
        persistDocumentDraft();
      }

      return body;
    }

    async function ingestDocument(options = {}) {
      ingestButton.disabled = true;
      automatedTruthRunButton.disabled = true;
      automatedTruthRunIngestButton.disabled = true;
      workflow.automationRunning = Boolean(options.automated);
      updateWorkflowStatus();
      try {
        const body = await buildDocumentRequestBody();

        const jobResponse = await apiJson("/api/ingest-document-async", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }, "Ingestion failed");

        await renderIngestResult(jobResponse.result, options);
        await refreshJobs();
      } catch (error) {
        showMessage(error.message, "danger");
      } finally {
        workflow.automationRunning = false;
        updateWorkflowStatus();
        ingestButton.disabled = false;
        automatedTruthRunButton.disabled = false;
        automatedTruthRunIngestButton.disabled = false;
      }
    }

    async function currentPayload() {
      try {
        persistPayload(payloadEl.value);
        return JSON.parse(payloadEl.value);
      } catch {
        throw new Error("The claim package JSON has a formatting problem. Use Reset sample or load a claim from Ingest.");
      }
    }

    async function runAssessment() {
      runButton.disabled = true;
      try {
        const input = await currentPayload();
        const [assessment, graph] = await Promise.all([
          apiJson("/api/assess", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }, "Assessment failed"),
          apiJson("/api/graph", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }, "Graph rendering failed")
        ]);
        renderAssessment(assessment, input);
        renderGraph(graph);
      } catch (error) {
        showMessage(error.message, "danger");
      } finally {
        runButton.disabled = false;
      }
    }

    async function boot() {
      restoreDocumentDraft();
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

    payloadEl.value = savedPayload();

    runButton.addEventListener("click", runAssessment);
    ingestButton.addEventListener("click", ingestDocument);
    automatedTruthRunButton.addEventListener("click", () => ingestDocument({ automated: true }));
    automatedTruthRunIngestButton.addEventListener("click", () => ingestDocument({ automated: true }));
    payloadEl.addEventListener("input", () => {
      persistPayload(payloadEl.value);
    });
    [docTitle, docMime, docContent, docPublicImpact].forEach((element) => {
      const eventName = element.tagName === "SELECT" || element.type === "checkbox" ? "change" : "input";
      element.addEventListener(eventName, () => {
        persistDocumentDraft();
      });
    });
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
      if (!name) return showMessage("Tenant name is required.", "danger");
      await apiFetch("/api/create-tenant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, plan: "enterprise", region: "us" }),
      });
      document.getElementById("tenantName").value = "";
      showMessage("Tenant created and selected.");
      await Promise.all([refreshHistory(), refreshJobs(), refreshReviewer(), refreshDossier(), refreshEnterprise()]);
    });
    createUserButton.addEventListener("click", async () => {
      const email = document.getElementById("userEmail").value.trim();
      const displayName = document.getElementById("userDisplayName").value.trim();
      if (!email || !displayName) return showMessage("Email and display name are required.", "danger");
      await apiFetch("/api/create-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName, role: document.getElementById("userRole").value }),
      });
      document.getElementById("userEmail").value = "";
      document.getElementById("userDisplayName").value = "";
      showMessage("User added to the active tenant.");
      await refreshEnterprise();
    });
    docFile.addEventListener("change", () => {
      const file = docFile.files && docFile.files[0];
      if (!file) return;
      docTitle.value = docTitle.value || file.name;
      docMime.value = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "text/plain");
      persistDocumentDraft();
    });
    resetButton.addEventListener("click", () => {
      payloadEl.value = JSON.stringify(sampleInput, null, 2);
      persistPayload(payloadEl.value);
      runAssessment();
    });
    exportButton.addEventListener("click", async () => {
      exportButton.disabled = true;
      try {
        const result = await apiJson("/api/export-dossier", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ allowRestrictedRelease: restrictedDossier.checked }),
        }, "Dossier export failed");
        document.getElementById("dossierRaw").textContent = JSON.stringify(result, null, 2);
        const summary = document.getElementById("exportSummary");
        summary.style.display = "block";
        summary.className = result.restrictedOverride ? "status-note warning" : "status-note";
        summary.textContent = result.restrictedOverride
          ? \`Restricted internal dossier created at \${result.pdfPath}. Public release remains blocked.\`
          : \`PDF artifact created at \${result.pdfPath}.\`;
        showMessage(result.restrictedOverride ? "Restricted internal dossier generated. Public release remains blocked." : "Dossier artifact generated.");
      } catch (error) {
        showMessage(error.message, "danger");
      } finally {
        exportButton.disabled = false;
      }
    });
    document.querySelectorAll("[data-report-format]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const format = button.getAttribute("data-report-format");
          const result = await apiJson("/api/export-live-report?format=" + encodeURIComponent(format), {}, "Live report export failed");
          document.getElementById("dossierRaw").textContent = result.content;
          showMessage(\`\${format.toUpperCase()} report exported.\`);
        } catch (error) {
          showMessage(error.message, "danger");
        }
      });
    });

    saveApiKeyButton.addEventListener("click", async () => {
      await saveApiKeyFromInput(apiKeyInput);
    });

    clearApiKeyButton.addEventListener("click", () => {
      localStorage.removeItem(API_KEY_STORAGE);
      updateApiKeyUi();
    });

    if (signOutButton) {
      signOutButton.addEventListener("click", async () => {
        try {
          await fetch("/api/auth/sign-out", { method: "POST" });
        } finally {
          window.location.assign("/auth");
        }
      });
    }

    [historySearch, historyReleaseState, historyMimeType, historyPublicImpact].forEach((element) => {
      const eventName = element.tagName === "SELECT" ? "change" : "input";
      element.addEventListener(eventName, () => {
        refreshHistory().catch((error) => showMessage(error.message, "danger"));
      });
    });

    [jobSearch, jobStatus, jobType].forEach((element) => {
      const eventName = element.tagName === "SELECT" ? "change" : "input";
      element.addEventListener(eventName, () => {
        refreshJobs().catch((error) => showMessage(error.message, "danger"));
      });
    });

    document.querySelectorAll("[data-set-role]").forEach((button) => {
      button.addEventListener("click", () => {
        setRoleMode(button.getAttribute("data-set-role"));
      });
    });

    initializeNavigationObservers();
    updateApiKeyUi();
    boot().catch((error) => {
      apiKeyStatus.value = error.message.toLowerCase().includes("key") ? "Shared access key issue" : "Startup error";
      console.error(error);
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] || char));
}

function renderAuthHtml(options: { nextPath: string; hasUsers: boolean; authUser: AuthUserSessionView | null }): string {
  const nextPath = safeInternalPath(options.nextPath, "/start");
  const authUser = options.authUser;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign In | Veritas Truth Engine</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #191714;
      --muted: #645d53;
      --line: #d8cdbb;
      --surface: #fffaf2;
      --panel: rgba(255,250,242,0.94);
      --teal: #0d7267;
      --gold: #b68717;
      --shadow: 0 24px 56px rgba(17, 15, 12, 0.18);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100svh;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top, rgba(255,255,255,0.88), rgba(255,255,255,0.42) 28%, rgba(246,243,237,0.92) 62%),
        linear-gradient(140deg, #0c1316, #182229 36%, #314854 72%, #efe6d9 100%);
    }

    button, input { font: inherit; }
    a { color: inherit; }

    .shell {
      min-height: 100svh;
      display: grid;
      grid-template-columns: minmax(320px, 1.1fr) minmax(360px, 0.9fr);
      gap: 24px;
      padding: 28px;
      align-items: stretch;
    }

    .hero {
      border-radius: 28px;
      padding: 44px;
      background:
        linear-gradient(135deg, rgba(11, 17, 20, 0.92), rgba(18, 26, 31, 0.72)),
        linear-gradient(120deg, rgba(13,114,103,0.34), rgba(182,135,23,0.12));
      color: #fffaf2;
      box-shadow: var(--shadow);
      display: grid;
      align-content: space-between;
      gap: 28px;
    }

    .hero img {
      width: min(360px, 100%);
      filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.4));
    }

    .eyebrow {
      margin: 0 0 16px;
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #e7c777;
      font-weight: 700;
    }

    h1 {
      margin: 0;
      font-size: clamp(42px, 6vw, 76px);
      line-height: 0.94;
      max-width: 8ch;
    }

    .hero p {
      max-width: 58ch;
      margin: 16px 0 0;
      line-height: 1.6;
      color: #ece4d5;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .hero-card {
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.05);
      padding: 16px;
      display: grid;
      gap: 8px;
    }

    .hero-card strong {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #e7c777;
    }

    .hero-card span {
      font-size: 14px;
      line-height: 1.5;
      color: #f6f0e7;
    }

    .panel {
      border-radius: 28px;
      background: var(--panel);
      box-shadow: var(--shadow);
      padding: 28px;
      display: grid;
      gap: 18px;
      align-content: start;
      backdrop-filter: blur(16px);
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .panel-head h2 {
      margin: 0;
      font-size: 28px;
    }

    .panel-head p {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.55;
    }

    .status {
      border-left: 4px solid var(--teal);
      border-radius: 14px;
      background: #edf7f5;
      padding: 12px 14px;
      color: var(--ink);
      line-height: 1.45;
    }

    .status.warning {
      border-left-color: var(--gold);
      background: #fff6df;
    }

    .tab-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .tab-row button {
      border: 1px solid var(--line);
      background: #f3ece0;
      color: var(--muted);
      border-radius: 999px;
      padding: 10px 14px;
      cursor: pointer;
      font-weight: 700;
    }

    .tab-row button.active {
      background: var(--ink);
      color: #fffaf2;
      border-color: var(--ink);
    }

    form {
      display: grid;
      gap: 14px;
    }

    form[hidden] { display: none; }

    label {
      display: grid;
      gap: 6px;
      font-weight: 700;
      color: var(--ink);
    }

    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
      background: #fffdf9;
      color: var(--ink);
    }

    .helper {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .button-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }

    .button {
      border: 0;
      border-radius: 12px;
      padding: 12px 16px;
      cursor: pointer;
      font-weight: 700;
      text-decoration: none;
    }

    .button.primary {
      background: var(--ink);
      color: #fffaf2;
    }

    .button.secondary {
      background: #ece3d5;
      color: var(--ink);
    }

    .signed-in {
      border-top: 1px solid var(--line);
      padding-top: 18px;
      display: grid;
      gap: 10px;
    }

    @media (max-width: 920px) {
      .shell {
        grid-template-columns: 1fr;
        padding: 18px;
      }

      .hero-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div>
        <img src="/assets/veritas-systems-logo.png" alt="Veritas Systems" />
        <p class="eyebrow">Verified Access</p>
        <h1>Sign in before entering Veritas.</h1>
        <p>Everyday users and corporate teams now come through one account gate first. Create an account for this local Veritas workspace or sign in with the credentials you already created.</p>
      </div>
      <div class="hero-grid">
        <div class="hero-card">
          <strong>Daily users</strong>
          <span>Open intake, findings, and reports after account access is confirmed.</span>
        </div>
        <div class="hero-card">
          <strong>Review teams</strong>
          <span>Resolve flagged work only after sign-in so review actions stay tied to a named person.</span>
        </div>
        <div class="hero-card">
          <strong>Corporate admins</strong>
          <span>Keep governance, tenant operations, and release controls behind the same entry point.</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Account Access</h2>
          <p>${options.hasUsers ? "Use your existing account or create another local access account." : "No local access accounts exist yet. Create the first one to open Veritas."}</p>
        </div>
      </div>
      <div id="authStatus" class="status${options.hasUsers ? "" : " warning"}">${options.hasUsers ? "Sign in to continue into the workspace." : "Create the first local account to continue."}</div>
      <div class="tab-row">
        <button type="button" id="showSignIn">Sign in</button>
        <button type="button" id="showSignUp">Create account</button>
      </div>

      <form id="signInForm" novalidate>
        <input type="hidden" id="signInNext" value="${escapeHtml(nextPath)}" />
        <label>Email
          <input id="signInEmail" type="email" autocomplete="username" placeholder="you@example.com" />
        </label>
        <label>Password
          <input id="signInPassword" type="password" autocomplete="current-password" placeholder="Enter your password" />
        </label>
        <div class="button-row">
          <button class="button primary" type="submit">Sign in</button>
          <span class="helper">Your access session stays in this browser until you sign out or the dev server restarts.</span>
        </div>
      </form>

      <form id="signUpForm" novalidate hidden>
        <input type="hidden" id="signUpNext" value="${escapeHtml(nextPath)}" />
        <label>Display name
          <input id="signUpDisplayName" autocomplete="name" placeholder="Jordan Analyst" />
        </label>
        <label>Email
          <input id="signUpEmail" type="email" autocomplete="username" placeholder="you@example.com" />
        </label>
        <label>Password
          <input id="signUpPassword" type="password" autocomplete="new-password" placeholder="At least 8 characters" />
        </label>
        <label>Confirm password
          <input id="signUpPasswordConfirm" type="password" autocomplete="new-password" placeholder="Re-enter your password" />
        </label>
        <div class="button-row">
          <button class="button primary" type="submit">Create account</button>
          <span class="helper">This local build stores account credentials only on this machine.</span>
        </div>
      </form>

      ${authUser ? `
      <div class="signed-in">
        <strong>Already signed in</strong>
        <span class="helper">${escapeHtml(authUser.displayName)} is already signed in as ${escapeHtml(authUser.email)}.</span>
        <div class="button-row">
          <a class="button secondary" href="/start">Open system now</a>
          <button class="button secondary" type="button" id="authSignOut">Sign out</button>
        </div>
      </div>` : ""}
    </section>
  </main>

  <script>
    const authState = ${JSON.stringify({
      nextPath,
      hasUsers: options.hasUsers,
      signedIn: Boolean(authUser),
    })};
    const statusEl = document.getElementById("authStatus");
    const signInForm = document.getElementById("signInForm");
    const signUpForm = document.getElementById("signUpForm");
    const showSignInButton = document.getElementById("showSignIn");
    const showSignUpButton = document.getElementById("showSignUp");
    const authSignOutButton = document.getElementById("authSignOut");

    function setStatus(message, tone = "") {
      statusEl.className = ("status" + (tone ? " " + tone : "")).trim();
      statusEl.textContent = message;
    }

    function showMode(mode) {
      const signInActive = mode === "sign-in";
      signInForm.hidden = !signInActive;
      signUpForm.hidden = signInActive;
      showSignInButton.classList.toggle("active", signInActive);
      showSignUpButton.classList.toggle("active", !signInActive);
    }

    async function postJson(url, payload) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Request failed.");
      }
      return data;
    }

    showSignInButton.addEventListener("click", () => showMode("sign-in"));
    showSignUpButton.addEventListener("click", () => showMode("sign-up"));

    signInForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("signInEmail").value.trim();
      const password = document.getElementById("signInPassword").value;
      const next = document.getElementById("signInNext").value || authState.nextPath || "/start";
      try {
        setStatus("Signing you in...");
        await postJson("/api/auth/sign-in", { email, password });
        window.location.assign("/transition?next=" + encodeURIComponent(next));
      } catch (error) {
        setStatus(error.message, "warning");
      }
    });

    signUpForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const displayName = document.getElementById("signUpDisplayName").value.trim();
      const email = document.getElementById("signUpEmail").value.trim();
      const password = document.getElementById("signUpPassword").value;
      const confirm = document.getElementById("signUpPasswordConfirm").value;
      const next = document.getElementById("signUpNext").value || authState.nextPath || "/start";
      if (password !== confirm) {
        setStatus("Password confirmation does not match.", "warning");
        return;
      }
      try {
        setStatus("Creating your account...");
        await postJson("/api/auth/sign-up", { displayName, email, password });
        window.location.assign("/transition?next=" + encodeURIComponent(next));
      } catch (error) {
        setStatus(error.message, "warning");
      }
    });

    if (authSignOutButton) {
      authSignOutButton.addEventListener("click", async () => {
        await postJson("/api/auth/sign-out", {});
        window.location.assign("/auth");
      });
    }

    showMode(authState.hasUsers ? "sign-in" : "sign-up");
  </script>
</body>
</html>`;
}

function renderTransitionHtml(nextPath: string | null | undefined, authUser: AuthUserSessionView): string {
  const safeNextPath = safeInternalPath(nextPath, "/start");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Entering Veritas | Veritas Truth Engine</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #fffaf2;
      --muted: rgba(255,250,242,0.82);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100svh;
      overflow: hidden;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      color: var(--ink);
      background: #050608;
    }

    .screen {
      position: relative;
      width: 100vw;
      min-height: 100svh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at center, rgba(255,255,255,0.12), rgba(6,7,10,0.1) 32%, rgba(5,6,8,0.76) 78%, rgba(5,6,8,0.96) 100%);
    }

    .screen video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #050608;
    }

    .overlay {
      position: relative;
      z-index: 1;
      width: 100%;
      min-height: 100svh;
      padding: 28px 28px 48px;
      display: grid;
      align-content: end;
      justify-items: center;
      gap: 14px;
      justify-items: center;
      text-align: center;
      background: linear-gradient(180deg, rgba(8,10,14,0.04), rgba(8,10,14,0.12) 58%, rgba(8,10,14,0.52) 100%);
    }

    .transition-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
    }

    .transition-button {
      border: 0;
      border-radius: 12px;
      padding: 12px 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      background: rgba(255,250,242,0.96);
      color: #11100e;
    }

    .transition-button.secondary {
      background: rgba(17,16,14,0.58);
      color: #fffaf2;
      border: 1px solid rgba(255,250,242,0.24);
    }

    h1 {
      margin: 0;
      font-size: clamp(34px, 5vw, 58px);
      text-shadow: 0 10px 26px rgba(0,0,0,0.34);
    }

    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
      max-width: 58ch;
      font-size: clamp(16px, 1.8vw, 20px);
      text-shadow: 0 8px 24px rgba(0,0,0,0.34);
    }

    .welcome-block {
      display: grid;
      gap: 10px;
      justify-items: center;
      margin-top: auto;
    }
  </style>
</head>
<body>
  <main class="screen">
    <video id="introVideo" playsinline preload="auto">
      <source src="/assets/veritas-truth-engine-intro.mp4" type="video/mp4" />
    </video>
    <div class="overlay">
      <div class="welcome-block">
        <h1>Welcome, ${escapeHtml(authUser.displayName)}.</h1>
        <p id="transitionMessage"></p>
      </div>
      <div class="transition-actions">
        <button id="playWithSoundButton" class="transition-button" type="button" hidden>Play intro with sound</button>
        <button id="skipIntroButton" class="transition-button secondary" type="button">Skip intro</button>
      </div>
    </div>
  </main>
  <script>
    const nextPath = ${JSON.stringify(safeNextPath)};
    const introVideo = document.getElementById("introVideo");
    const playWithSoundButton = document.getElementById("playWithSoundButton");
    const skipIntroButton = document.getElementById("skipIntroButton");
    const transitionMessage = document.getElementById("transitionMessage");
    let forwarded = false;

    function finishTransition() {
      if (forwarded) return;
      forwarded = true;
      window.location.replace(nextPath);
    }

    async function startIntroWithSound() {
      if (!introVideo) return;
      introVideo.muted = false;
      introVideo.volume = 1;
      try {
        await introVideo.play();
        if (playWithSoundButton) playWithSoundButton.hidden = true;
      } catch {
        if (playWithSoundButton) playWithSoundButton.hidden = false;
        if (transitionMessage) {
          transitionMessage.textContent = "Your browser is waiting for one click before it can play the intro with audio.";
        }
      }
    }

    if (introVideo) {
      introVideo.addEventListener("ended", finishTransition);
      introVideo.addEventListener("error", finishTransition);
      startIntroWithSound();
    }

    if (playWithSoundButton) {
      playWithSoundButton.addEventListener("click", () => {
        startIntroWithSound();
      });
    }

    if (skipIntroButton) {
      skipIntroButton.addEventListener("click", finishTransition);
    }

    window.setTimeout(finishTransition, 20000);
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const ctx: RequestContext = {
    requestId: req.headers["x-request-id"]?.toString() || randomUUID(),
    startedAt: Date.now(),
    method: req.method ?? "GET",
    pathname: url.pathname,
  };

  try {
    const authUser = authenticatedUser(req);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendRedirect(res, authUser ? "/start" : `/auth?next=${encodeURIComponent("/start")}`, 302, ctx);
      return;
    }

    if (url.pathname === "/auth") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      res.writeHead(200, securityHeaders({ "content-type": "text/html; charset=utf-8" }, ctx.requestId));
      res.end(renderAuthHtml({
        nextPath: safeInternalPath(url.searchParams.get("next"), "/start"),
        hasUsers: localAuthStore.hasUsers(),
        authUser,
      }));
      logRequest(ctx, 200);
      return;
    }

    if (url.pathname === "/api/auth/session") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, {
        ok: true,
        authenticated: Boolean(authUser),
        authUser,
        hasUsers: localAuthStore.hasUsers(),
      }, 200, ctx);
      return;
    }

    if (url.pathname === "/api/auth/sign-up") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      const payload = await parseJsonPayload(req);
      let user: AuthUserSessionView;
      try {
        user = localAuthStore.signUp({
          displayName: String(payload.displayName ?? ""),
          email: String(payload.email ?? ""),
          password: String(payload.password ?? ""),
        });
      } catch (error) {
        throw new HttpStatusError(400, error instanceof Error ? error.message : "Account creation failed.");
      }
      const token = localAuthStore.createSession(user.id);
      sendJson(res, { ok: true, authUser: user }, 201, ctx, { "set-cookie": sessionCookie(token) });
      return;
    }

    if (url.pathname === "/api/auth/sign-in") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      const payload = await parseJsonPayload(req);
      let user: AuthUserSessionView;
      try {
        user = localAuthStore.signIn({
          email: String(payload.email ?? ""),
          password: String(payload.password ?? ""),
        });
      } catch (error) {
        throw new HttpStatusError(401, error instanceof Error ? error.message : "Sign in failed.");
      }
      const token = localAuthStore.createSession(user.id);
      sendJson(res, { ok: true, authUser: user }, 200, ctx, { "set-cookie": sessionCookie(token) });
      return;
    }

    if (url.pathname === "/api/auth/sign-out") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      localAuthStore.revokeSession(authSessionToken(req));
      sendJson(res, { ok: true }, 200, ctx, { "set-cookie": clearSessionCookie() });
      return;
    }

    if (!authUser && requiresAuth(url.pathname)) {
      if (url.pathname.startsWith("/api/")) {
        sendJson(res, {
          ok: false,
          error: "Sign in is required.",
          remediation: `Open /auth and sign in before requesting ${url.pathname}.`,
        }, 401, ctx);
        return;
      }
      sendRedirect(res, `/auth?next=${encodeURIComponent(authRedirectTarget(url))}`, 302, ctx);
      return;
    }

    if (!apiKeyAllowed(req, res, url.pathname, ctx)) return;

    if (url.pathname === "/healthz") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, { ok: true, status: "healthy", uptimeSeconds: Math.round((Date.now() - SERVER_STARTED_AT) / 1000) }, 200, ctx);
      return;
    }

    if (url.pathname === "/__veritas_live_reload") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      attachLiveReload(req, res, ctx);
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
      sendJson(
        res,
        await listIngestionHistoryWithQuery({
          q: url.searchParams.get("q") ?? undefined,
          releaseState: (url.searchParams.get("releaseState") as "auto_release" | "review_required" | "hold" | "any" | null) ?? undefined,
          mimeType: url.searchParams.get("mimeType") ?? undefined,
          publicImpact: parseBooleanFlag(url.searchParams.get("publicImpact")),
          limit: parseInteger(url.searchParams.get("limit"), 50),
        }),
        200,
        ctx
      );
      return;
    }

    if (url.pathname.startsWith("/api/ingestion-history/")) {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await getIngestionHandler(decodeURIComponent(url.pathname.split("/").pop() || "")), 200, ctx);
      return;
    }

    if (url.pathname === "/api/jobs") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(
        res,
        await listJobsWithQuery({
          q: url.searchParams.get("q") ?? undefined,
          status: (url.searchParams.get("status") as "queued" | "running" | "completed" | "failed" | "cancelled" | "any" | null) ?? undefined,
          type: (url.searchParams.get("type") as "document_ingestion" | "report_export" | "dossier_export" | "ocr_extraction" | "any" | null) ?? undefined,
          limit: parseInteger(url.searchParams.get("limit"), 25),
        }),
        200,
        ctx
      );
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

    if (url.pathname === "/api/remove-user") {
      if (!methodAllowed(req, res, ["POST"], ctx)) return;
      sendJson(res, await removeUserHandler(await parseJsonPayload(req)), 200, ctx);
      return;
    }

    if (url.pathname === "/api/integrations") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendJson(res, await integrationStatusHandler(), 200, ctx);
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
      sendJson(res, await reviewerWorkspaceHandler(), 200, ctx);
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
      sendJson(res, await exportDossierHandler(await parseJsonPayload(req)), 200, ctx);
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

    if (url.pathname === "/downloads/veritas-evidence-dossier.pdf") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendDownload(res, DOWNLOADS.latestDossierPdf, "veritas-evidence-dossier.pdf", "application/pdf", ctx);
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

    if (url.pathname === "/assets/veritas-truth-engine-intro.mp4") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      sendAsset(res, ASSETS.introVideo, "video/mp4", ctx);
      return;
    }

    if (url.pathname.startsWith("/assets/pdfjs/")) {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      const asset = resolvePdfJsAsset(url.pathname.slice("/assets/pdfjs/".length));
      if (!asset) {
        sendJson(res, { ok: false, error: "PDF viewer asset not found." }, 404, ctx);
        return;
      }
      sendAsset(res, asset.filePath, asset.contentType, ctx);
      return;
    }

    if (url.pathname === "/transition") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      res.writeHead(200, securityHeaders({ "content-type": "text/html; charset=utf-8" }, ctx.requestId));
      res.end(renderTransitionHtml(url.searchParams.get("next"), authUser!));
      logRequest(ctx, 200);
      return;
    }

    if (url.pathname === "/pdf-preview") {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      const source = resolvePdfPreviewSource(url.searchParams.get("source"));
      if (!source) {
        sendJson(res, {
          ok: false,
          error: "Unknown PDF preview source.",
          remediation: "Use /pdf-preview?source=operations-manual or /pdf-preview?source=latest-dossier.",
        }, 400, ctx);
        return;
      }
      res.writeHead(200, securityHeaders({ "content-type": "text/html; charset=utf-8" }, ctx.requestId));
      res.end(renderPdfPreviewHtml(source));
      logRequest(ctx, 200, { previewSource: source.key });
      return;
    }

    const pageRoutes: Record<string, string> = {
      "/start": "start",
      "/ingest": "ingest",
      "/results": "assess",
      "/review": "review",
      "/report": "dossier",
      "/settings": "enterprise",
    };

    if (pageRoutes[url.pathname]) {
      if (!methodAllowed(req, res, ["GET"], ctx)) return;
      res.writeHead(200, securityHeaders({ "content-type": "text/html; charset=utf-8" }, ctx.requestId));
      res.end(renderAppHtml(pageRoutes[url.pathname], authUser!));
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
    if (error instanceof HttpStatusError) {
      sendJson(
        res,
        {
          ok: false,
          error: error.message,
          ...error.details,
        },
        error.status,
        ctx
      );
      return;
    }

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
