# Veritas Truth Engine Operations Manual

Version: 1.0  
Product: Veritas Truth Engine  
Audience: Operators, reviewers, tenant administrators, security teams, and release managers  
Last updated: April 18, 2026

## 1. Operating Doctrine

Veritas Truth Engine exists to ensure that no output is released without traceable truth validation. Every claim must be tied to evidence, every evidence item must have provenance, every assessment must expose uncertainty, and every release decision must be gated by policy.

The operating rule is simple:

1. Ingest source material.
2. Extract atomic claims.
3. Bind claims to exact evidence spans.
4. Score claims with uncertainty and provenance features.
5. Route risky claims to review.
6. Export dossiers only with chain-of-custody context.
7. Preserve audit history for every meaningful action.

Veritas does not declare absolute truth. It produces evidence-linked probabilistic assessments and makes the confidence, provenance, and release risk visible.

## 2. System Overview

The current application provides these operating surfaces:

- Ingestion Workspace: Accepts text, Markdown, JSON, and PDF uploads.
- Claim Extraction Pipeline: Converts source material into atomic claims.
- Evidence Binding: Links claims to quoted spans, offsets, source versions, and content hashes.
- Truth Assessment Engine: Scores claims using support, reliability, provenance, temporal coherence, contradiction pressure, and deception signals.
- Review Queue: Creates tasks for claims that require human judgment before release.
- Provenance Graph: Shows claim, evidence, source, and review relationships.
- Dossier Export: Produces publication-ready evidence packages and release recommendations.
- Enterprise Control Plane: Manages tenants, users, audit events, jobs, and repository diagnostics.

## 3. Local Runtime

### Start the application

From the application directory:

```powershell
npm run start
```

Default URL:

```text
http://localhost:3017
```

### Verify the runtime

Use these commands:

```powershell
npm run check
npm run build
```

Expected result:

- TypeScript check completes with no errors.
- Build completes with no errors.
- The server logs `Veritas Truth Engine running at http://localhost:3017`.

### Authenticated operation

Set `VERITAS_API_KEY` when the app must reject unauthenticated API access. Operators can enter the same key in the Enterprise control plane API key field. The key is stored only in the current browser's local storage and is sent as `x-veritas-api-key` on API requests.

### Local state

In local mode, state is stored in:

```text
data/veritas-store.json
```

This file contains local tenant data, users, ingestions, jobs, review tasks, audit events, and generated operational state. Treat this file as sensitive because it can include source excerpts and assessment payloads.

## 4. Production Repository Mode

The application supports a repository abstraction:

- Local repository for development and demos.
- PostgreSQL repository for production-style enterprise persistence.

Production mode requires:

```text
DATABASE_URL=<postgres connection string>
VERITAS_REPOSITORY=postgres
```

Apply the enterprise schema before enabling Postgres mode:

```text
sql/schema_enterprise.sql
```

The enterprise schema includes:

- Tenant isolation.
- User and role inventory.
- Ingestion persistence.
- Source and source-version records.
- Document chunks.
- Claims.
- Evidence spans.
- Truth assessments.
- Review tasks.
- Jobs.
- Audit events.
- Payload JSON for reconstructing dossiers and reports.

## 5. Roles and Responsibilities

### Operator

- Starts and monitors the application.
- Confirms ingestion jobs complete successfully.
- Reviews repository diagnostics.
- Escalates failed jobs and runtime errors.

### Reviewer

- Works the review queue.
- Approves, holds, or escalates claims.
- Confirms evidence spans support the claim.
- Checks uncertainty bands and release rationale.

### Tenant Administrator

- Creates tenants and users.
- Confirms the correct active tenant.
- Reviews audit logs.
- Ensures data separation between tenants.

### Release Manager

- Reviews dossier recommendations.
- Confirms no hold claims are included in external release.
- Archives exported dossiers.
- Records release decisions outside the application if required by policy.

### Security Administrator

- Protects database credentials.
- Monitors access patterns.
- Reviews audit logs for anomalous activity.
- Manages backup and retention policies.

## 6. Daily Operations Checklist

Run this checklist at the start of each operating session:

1. Confirm the server starts without errors.
2. Open `http://localhost:3017`.
3. Confirm Repository Adapter diagnostics show the intended mode.
4. Confirm the active tenant is correct.
5. Confirm no ingestion jobs are stuck in `running`.
6. Review failed jobs and retry if needed.
7. Review open review tasks.
8. Export a sample dossier if release workflows are active.
9. Confirm audit events are being recorded.

End-of-session checklist:

1. Confirm all new ingestions completed or failed cleanly.
2. Record unresolved review tasks.
3. Export required dossiers.
4. Back up local state or confirm database backup policy.
5. Stop the local server if it is not needed.

## 7. Ingestion Procedure

Use the Ingest section in the app.

Required fields:

- Title.
- Type.
- Document text or uploaded file.

Supported input types:

- Text.
- Markdown.
- JSON.
- PDF.

Procedure:

1. Select the document type.
2. Paste text or upload a file.
3. Enable the public-impact review gate when the content may affect public release, regulated decisions, safety, finance, legal claims, medical claims, or reputational outcomes.
4. Select `Ingest document`.
5. Confirm the Processing Jobs panel shows a completed job.
6. Confirm extracted claim count and review count.
7. Load the first claim if immediate assessment review is needed.

Expected output:

- Document hash.
- Source and source-version records.
- Chunks.
- Extracted claim packages.
- Evidence spans.
- Truth assessments.
- Review tasks for gated or risky claims.

## 8. Review Procedure

The Review section lists claims that require human attention.

For each task:

1. Read the claim text.
2. Read the release gate and truth state.
3. Confirm the evidence quote actually supports or contradicts the claim.
4. Check whether the source is reliable enough for the claim severity.
5. Check the confidence band. A wide band means the assessment is uncertain.
6. Choose the correct action:
   - Approve when evidence is sufficient and release risk is acceptable.
   - Hold when evidence is insufficient or risk remains high.
   - Escalate when specialist, legal, security, or executive review is needed.

Review standards:

- Do not approve a claim solely because it has a numeric score.
- Do not approve a claim if the quoted evidence does not directly support it.
- Do not approve high-impact claims without adequate source quality.
- Escalate public-impact claims when contradiction, low support, or manipulation risk appears.

## 9. Dossier Export Procedure

Use the Dossier section.

Available outputs:

- Dossier preview.
- PDF artifact generation.
- Live report exports in Markdown, JSON, or HTML.

Procedure:

1. Refresh the dossier preview.
2. Read the release recommendation.
3. Confirm records count matches expected scope.
4. Review chain-of-custody notes.
5. Check for hold claims.
6. Generate the PDF artifact or export the live report.
7. Archive the exported artifact with the release decision.

Release rule:

- If the dossier says not to release externally, do not publish until hold claims are adjudicated.

## 10. Enterprise Control Plane Procedure

Use the Enterprise section to manage local enterprise state.

Tenant operations:

1. Confirm active tenant before ingestion.
2. Create a tenant only when a distinct customer, workspace, or data boundary is needed.
3. Switch tenants before reviewing tenant-specific history.

User operations:

1. Add users with real operational emails where possible.
2. Assign roles according to least privilege.
3. Review audit logs after creating or changing users.

Diagnostics:

1. Check repository mode.
2. Confirm persistence target.
3. Confirm active tenant.
4. Review counts for ingestions, claims, open reviews, running jobs, and audit events.

## 11. API Reference

Primary local endpoints:

```text
POST /api/ingest-document-async
GET  /api/jobs
GET  /api/jobs/:id
POST /api/assess
POST /api/graph
GET  /api/reviewer-workspace
POST /api/review-action
GET  /api/dossier-preview
POST /api/export-dossier
GET  /api/export-live-report?format=markdown
GET  /api/export-live-report?format=json
GET  /api/export-live-report?format=html
GET  /api/enterprise-state
POST /api/create-tenant
POST /api/switch-tenant
POST /api/create-user
GET  /api/audit-log
GET  /api/repository-diagnostics
GET  /downloads/veritas-operations-manual.md
GET  /downloads/veritas-operations-manual.pdf
```

Async ingestion accepts:

```json
{
  "title": "Example source packet",
  "mimeType": "text/plain",
  "content": "Source text goes here.",
  "publicImpact": true
}
```

The ingestion endpoint also accepts `text` or `rawText` as aliases for `content`.

## 12. Security Controls

Minimum controls before external production release:

- Use PostgreSQL repository mode.
- Store `DATABASE_URL` in a secret manager, not in source code.
- Require authentication before exposing the UI outside a local trusted machine.
- Enforce tenant isolation for every query.
- Back up the database on a tested schedule.
- Encrypt backups.
- Restrict access to exported dossiers.
- Log administrative actions.
- Review audit logs regularly.
- Treat source documents, evidence spans, and dossiers as sensitive data.

Recommended production controls:

- Single sign-on.
- Role-based access control.
- Audit log export to a security information and event management system.
- Rate limits on ingestion and export endpoints.
- Malware scanning for uploaded files.
- Data retention policies by tenant.
- Legal hold support for regulated customers.
- Disaster recovery runbooks.

## 13. Backup and Restore

### Local mode

Back up:

```text
data/veritas-store.json
```

Restore:

1. Stop the server.
2. Replace `data/veritas-store.json` with the backup copy.
3. Restart the server.
4. Confirm repository diagnostics and ingestion history.

### PostgreSQL mode

Back up using approved database tooling. At minimum, protect:

- Tenants.
- Users.
- Sources.
- Source versions.
- Documents.
- Chunks.
- Claims.
- Evidence spans.
- Assessments.
- Review tasks.
- Jobs.
- Audit events.

After restore:

1. Run repository diagnostics.
2. Confirm active tenant.
3. Confirm ingestion history.
4. Generate a dossier preview.
5. Check a sample review task.

## 14. Monitoring

Monitor these signals:

- Server process is running.
- `/api/repository-diagnostics` returns `ok: true`.
- Running jobs do not remain stuck.
- Failed jobs are investigated.
- Open review task count is expected.
- Audit event count increases after administrative actions.
- Export endpoints respond successfully.
- Browser console has no runtime errors.

Suggested operational thresholds:

- Any ingestion failure: investigate.
- Any job stuck in `running` for more than 10 minutes: investigate.
- Any unexpected tenant switch: investigate.
- Any unexplained audit event: escalate to security.
- Any release dossier with hold claims: block external release.

## 15. Incident Response

### Failed ingestion

1. Open Processing Jobs.
2. Read the failed job error.
3. Confirm the input had extractable content.
4. If PDF extraction failed, paste extracted text manually or install the required PDF parser dependency.
5. Retry ingestion.
6. Record repeated failures.

### Incorrect claim extraction

1. Load the source text.
2. Compare extracted claim text with original evidence span.
3. Mark the review task as hold or escalate.
4. Re-ingest a cleaner version of the source if needed.

### Dossier says do not release

1. Identify hold claims.
2. Review evidence and assessment rationale.
3. Add stronger evidence or perform human adjudication.
4. Export again only after release gates are acceptable.

### Suspected data exposure

1. Stop external access.
2. Preserve logs and audit events.
3. Identify affected tenant and records.
4. Rotate secrets.
5. Notify stakeholders according to policy.
6. Document corrective action.

## 16. Troubleshooting

### Server does not start

Run:

```powershell
npm run check
npm run build
```

Then inspect:

```text
veritas-server.log
veritas-server.err.log
```

### Port 3017 is already in use

Stop the existing process or run with another port:

```powershell
$env:PORT=3020
npm run start
```

### PDF ingestion fails

The PDF parser uses Python and `pypdf` when extracting local PDF text. Install `pypdf` for the active Python interpreter or paste extracted text into the document text box.

### Repository diagnostics show local mode

Confirm environment variables:

```text
VERITAS_REPOSITORY=postgres
DATABASE_URL=<postgres connection string>
```

Restart the server after changing environment variables.

### Dossier exports are empty

1. Confirm at least one ingestion completed.
2. Confirm claims were extracted.
3. Confirm review tasks or assessments exist.
4. Refresh the dossier preview.

## 17. Release Readiness Checklist

Before global market release, confirm:

1. Authentication is enabled.
2. Role-based access control is enforced.
3. PostgreSQL mode is active.
4. Tenant isolation has been tested.
5. Database backups are scheduled and tested.
6. Audit logging is immutable or exported to secured storage.
7. File uploads are scanned and size limited.
8. Secrets are stored outside the repository.
9. Review workflow has documented owners.
10. Dossier release policy is approved.
11. Monitoring and alerting are active.
12. Incident response contacts are defined.
13. Terms, privacy, and compliance requirements are reviewed.
14. Load testing is complete for target usage.
15. Disaster recovery restore has been tested.

## 18. Operator Quick Reference

Start:

```powershell
npm run start
```

Check:

```powershell
npm run check
npm run build
```

Open:

```text
http://localhost:3017
```

Key sections:

- Ingest: add documents.
- Assessment: inspect a claim.
- Graph: inspect provenance relationships.
- Review: adjudicate gated claims.
- Dossier: export evidence packages.
- Enterprise: manage tenants, users, audit events, and repository diagnostics.

Core rule:

```text
No output exists without traceable truth validation.
```
