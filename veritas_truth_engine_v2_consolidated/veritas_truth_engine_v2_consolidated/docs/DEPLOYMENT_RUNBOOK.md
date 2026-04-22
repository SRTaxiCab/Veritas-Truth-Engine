# Deployment Runbook

Veritas Truth Engine v2 consolidated

This runbook covers the minimum production-readiness slice for local execution, PostgreSQL mode, schema application, verification, backup, restore, and release validation.

## 1. Local Run

Start from the repository root:

```powershell
npm run check
npm test
npm run build
npm run start
```

Default local URL:

```text
http://localhost:3017
```

If port `3017` is already in use:

```powershell
$env:PORT=3020
npm run start
```

Local mode stores state in:

```text
data/veritas-store.json
```

## 2. PostgreSQL Mode

Set these environment variables for Postgres-backed runs:

```text
DATABASE_URL=postgres://...
VERITAS_REPOSITORY=postgres
PGSSL=require|disable
```

Optional, when you want to pin the initial enterprise context:

```text
VERITAS_TENANT_ID=<tenant uuid>
VERITAS_USER_ID=<user uuid>
```

`PGSSL=require` is for TLS-required database endpoints. `PGSSL=disable` matches the example local-style connection string.

## 2.1 Container Run

The Docker path requires Docker Desktop running in Linux containers mode. On Windows, Docker Desktop must have a working Linux backend such as WSL 2 or Hyper-V Linux containers before `node:22-bookworm-slim` and `postgres:16-alpine` can be pulled.

Build the application image:

```powershell
npm run docker:build
```

Run with local storage:

```powershell
docker run --rm -p 3017:3017 -e VERITAS_REPOSITORY=local veritas-truth-engine:local
```

Run the app with PostgreSQL using Docker Compose:

```powershell
$env:VERITAS_API_KEY="<shared local key>"
npm run docker:up
```

Docker Compose applies `sql/schema_enterprise.sql` to the local Postgres container on first database initialization and exposes the app at:

```text
http://localhost:3017
```

## 3. Environment Variables

Core variables used by the repo:

- `DATABASE_URL`: required for PostgreSQL persistence and assessment persistence.
- `VERITAS_REPOSITORY`: set to `postgres` to enable the PostgreSQL enterprise repository; omit or set to `local` for local storage.
- `PGSSL`: set to `require` when the database demands TLS.
- `PORT`: overrides the local server port.
- `PYTHON`: optional, used by PDF parsing and PDF export helpers when a specific interpreter must be selected.
- `VERITAS_TENANT_ID`: optional enterprise context override.
- `VERITAS_USER_ID`: optional enterprise context override.
- `VERITAS_API_KEY`: optional API key gate. When set, API routes require `x-veritas-api-key` or `Authorization: Bearer <key>`.
- `VERITAS_MAX_BODY_BYTES`: request body limit for JSON and document-ingestion requests.
- `VERITAS_BASE_URL`: base URL used by verification scripts.
- `VERITAS_VERIFY_TIMEOUT_MS`: per-request timeout used by `npm run verify:server`.
- `VERITAS_ASSESSMENT_REPOSITORY`: optional legacy switch. Set to `legacy-postgres` only when the legacy `truth_assessments_v2` schema is applied and standalone `/api/assess` persistence is required.

## 4. Schema Application

Apply the schema that matches the deployment shape you are using.

For the consolidated v2 schema:

```text
sql/schema_v2_all.sql
```

For enterprise PostgreSQL mode:

```text
sql/schema_enterprise.sql
```

Typical application step:

```powershell
psql "$env:DATABASE_URL" -f sql/schema_enterprise.sql
```

After schema application, restart the app and confirm the repository reports the intended mode.

In enterprise PostgreSQL mode, ingestion and dossier workflows persist through `sql/schema_enterprise.sql`. The standalone `/api/assess` endpoint evaluates claims without writing to legacy `truth_assessments_v2` tables unless `VERITAS_ASSESSMENT_REPOSITORY=legacy-postgres` is explicitly set and the legacy schema is present.

## 5. Health Checks

Minimum checks after startup:

1. Open `http://localhost:3017`.
2. Confirm the page loads without console errors.
3. Request `GET /healthz`.
4. Request `GET /readyz`.
5. Request `GET /api/repository-diagnostics`.
6. Confirm `ok: true`.
7. Confirm `mode` matches the intended repository mode.
8. Confirm `configured: true` when PostgreSQL is enabled.
9. Confirm `databaseUrlPresent: true` when Postgres is expected.

Useful follow-up checks:

- `GET /api/enterprise-state`
- `GET /api/jobs`
- `GET /api/dossier-preview`

Run the automated smoke verifier against a running server:

```powershell
npm run verify:server
```

When `VERITAS_API_KEY` is enabled for the server, provide the same value to the verifier:

```powershell
$env:VERITAS_API_KEY="<shared key>"
npm run verify:server
```

The browser UI stores the key locally in the user's browser from the Enterprise control plane. This keeps authenticated local operations usable without embedding the key in the page source.

Docker Compose sets `VERITAS_API_KEY` from the host environment and falls back to `veritas_local_dev_key_change_me` for local-only runs. Replace that fallback for any shared, staged, or externally reachable environment.

## 6. Backup and Restore

Local mode:

1. Stop the server.
2. Back up `data/veritas-store.json`.
3. Restore by replacing the file with a known-good copy.
4. Restart the server and verify repository diagnostics and ingestion history.

PostgreSQL mode:

1. Use approved database tooling such as `pg_dump`.
2. Back up the full database, including tenants, users, sources, source versions, documents, claims, evidence, jobs, review tasks, and audit events.
3. Restore with the matching PostgreSQL restore tooling for your backup format.
4. Restart the app and confirm repository diagnostics, tenant context, and a sample dossier preview.

Example backup commands:

```powershell
pg_dump "$env:DATABASE_URL" -Fc -f veritas_truth_engine.backup
```

```powershell
pg_restore -d "$env:DATABASE_URL" veritas_truth_engine.backup
```

## 7. Release Validation

Before promoting a release:

1. Run `npm run check` and `npm run build`.
2. Confirm the app starts cleanly in the target mode.
3. Confirm `GET /api/repository-diagnostics` reports the expected repository and configuration.
4. Ingest a representative claim package and confirm the job completes.
5. Confirm non-auto-release claims route into review.
6. Open the dossier preview and confirm release recommendations render.
7. Verify backup and restore worked on a recent copy.
8. Confirm the external release gate blocks any dossier with unresolved hold claims.

For deeper operating procedures, use `docs/veritas_operations_manual.md`.
