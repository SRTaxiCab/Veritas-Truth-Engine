type JsonRecord = Record<string, unknown>;

const BASE_URL = normalizeBaseUrl(
  process.env.VERITAS_BASE_URL ??
    process.env.BASE_URL ??
    (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : "http://127.0.0.1:3017")
);

const REQUEST_TIMEOUT_MS = Number(process.env.VERITAS_VERIFY_TIMEOUT_MS ?? 15_000);
const API_KEY = process.env.VERITAS_API_KEY ?? process.env.VERITAS_VERIFY_API_KEY;

function authHeaders(): Record<string, string> {
  return API_KEY ? { "x-veritas-api-key": API_KEY } : {};
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

async function requestJson(pathname: string, init?: RequestInit): Promise<{ status: number; body: JsonRecord }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });

    const text = await response.text();
    const body = text ? parseJson(text, pathname) : {};

    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestBytes(pathname: string): Promise<{ status: number; contentType: string | null; body: Uint8Array }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${pathname}`, { headers: authHeaders(), signal: controller.signal });
    const body = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, contentType: response.headers.get("content-type"), body };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text: string, label: string): JsonRecord {
  try {
    return JSON.parse(text) as JsonRecord;
  } catch (error) {
    throw new Error(`Expected JSON from ${label}, got: ${preview(text)}${error instanceof Error ? ` (${error.message})` : ""}`);
  }
}

function preview(text: string): string {
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertJsonObject(value: unknown, label: string): asserts value is JsonRecord {
  assert(Boolean(value) && typeof value === "object" && !Array.isArray(value), `${label} must be a JSON object.`);
}

function assertString(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  assert(Array.isArray(value), `${label} must be an array.`);
}

async function main(): Promise<void> {
  const failures: string[] = [];
  const checks: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: "health",
      run: async () => {
        const response = await requestJson("/healthz");
        assert(response.status === 200, `Expected 200, got ${response.status}.`);
        assertJsonObject(response.body, "health");
        assert(response.body.ok === true, "Health endpoint should return ok: true.");
        assert(response.body.status === "healthy", `Expected healthy status, got ${String(response.body.status)}.`);
      },
    },
    {
      name: "readiness",
      run: async () => {
        const response = await requestJson("/readyz");
        assert(response.status === 200, `Expected 200, got ${response.status}.`);
        assertJsonObject(response.body, "readiness");
        assert(response.body.ok === true, "Readiness endpoint should return ok: true.");
        assert(response.body.status === "ready", `Expected ready status, got ${String(response.body.status)}.`);
        assertJsonObject(response.body.repository, "readiness.repository");
      },
    },
    {
      name: "repository diagnostics",
      run: async () => {
        const response = await requestJson("/api/repository-diagnostics");
        assert(response.status === 200, `Expected 200, got ${response.status}.`);
        assertJsonObject(response.body, "repository diagnostics");
        assert(response.body.ok === true || response.body.ok === false, "`ok` must be boolean.");
        assertString(response.body.mode, "diagnostics.mode");
        assert("configured" in response.body, "diagnostics.configured is missing.");
      },
    },
    {
      name: "async ingestion",
      run: async () => {
        const payload = {
          title: `Smoke Test Ingestion ${new Date().toISOString()}`,
          mimeType: "text/plain",
          content:
            "Veritas Truth Engine verification smoke test. The committee revised its public account after the memorandum was circulated.",
          publicImpact: true,
        };

        const response = await requestJson("/api/ingest-document-async", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        assert(response.status === 200, `Expected 200, got ${response.status}.`);
        assertJsonObject(response.body, "async ingestion");
        assert(response.body.ok === true, "Async ingestion should return ok: true.");
        const job = response.body.job;
        const result = response.body.result;
        assertJsonObject(job, "async ingestion job");
        assertJsonObject(result, "async ingestion result");
        const document = result.document;
        assertJsonObject(document, "async ingestion result document");
        assertString(job.id, "job.id");
        assert(job.status === "completed", `Expected completed job, got ${String(job.status)}.`);
        assertString(document.id, "result.document.id");
        assertString(document.title, "result.document.title");

        const jobLookup = await requestJson(`/api/jobs/${encodeURIComponent(job.id)}`);
        assert(jobLookup.status === 200, `Expected 200 from job lookup, got ${jobLookup.status}.`);
        assertJsonObject(jobLookup.body, "job lookup");
        assert(jobLookup.body.ok === true, "Job lookup should return ok: true.");
        const lookupJob = jobLookup.body.job;
        assertJsonObject(lookupJob, "job lookup job");
        assert(lookupJob.status === "completed", `Expected completed lookup job, got ${String(lookupJob.status)}.`);
      },
    },
    {
      name: "jobs",
      run: async () => {
        const response = await requestJson("/api/jobs");
        assert(response.status === 200, `Expected 200, got ${response.status}.`);
        assertJsonObject(response.body, "jobs");
        assert(response.body.ok === true, "Jobs endpoint should return ok: true.");
        assertArray(response.body.jobs, "jobs.jobs");
        assert(response.body.jobs.length > 0, "Jobs list should contain at least one job after async ingestion.");
      },
    },
    {
      name: "dossier preview",
      run: async () => {
        const response = await requestJson("/api/dossier-preview");
        assert(response.status === 200, `Expected 200, got ${response.status}.`);
        assertJsonObject(response.body, "dossier preview");
        assertJsonObject(response.body.metadata, "dossier metadata");
        assertString(response.body.metadata.title, "dossier.metadata.title");
        assertString(response.body.releaseRecommendation, "dossier.releaseRecommendation");
        assertArray(response.body.records, "dossier.records");
        assertArray(response.body.chainOfCustodyNotes, "dossier.chainOfCustodyNotes");
        assert(response.body.chainOfCustodyNotes.length > 0, "Dossier should include chain-of-custody notes.");
      },
    },
    {
      name: "operations manual markdown",
      run: async () => {
        const response = await requestBytes("/downloads/veritas-operations-manual.md");
        assert(response.status === 200, `Expected 200, got ${response.status}.`);
        assertString(response.contentType, "markdown content-type");
        assert(response.contentType.includes("text/markdown"), `Expected markdown content-type, got ${response.contentType}.`);
        assert(response.body.length > 0, "Markdown manual should not be empty.");
      },
    },
    {
      name: "operations manual pdf",
      run: async () => {
        const response = await requestBytes("/downloads/veritas-operations-manual.pdf");
        assert(response.status === 200, `Expected 200, got ${response.status}.`);
        assertString(response.contentType, "pdf content-type");
        assert(response.contentType.includes("application/pdf"), `Expected PDF content-type, got ${response.contentType}.`);
        assert(response.body.length > 4, "PDF manual should not be empty.");
        const signature = Buffer.from(response.body.subarray(0, 4)).toString("utf8");
        assert(signature === "%PDF", `Expected PDF signature, got ${signature}.`);
      },
    },
  ];

  console.log(`Veritas smoke test target: ${BASE_URL}`);

  for (const check of checks) {
    try {
      await check.run();
      console.log(`PASS ${check.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${check.name}: ${message}`);
      console.error(`FAIL ${check.name}`);
      console.error(message);
      break;
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  console.log("All smoke checks passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
