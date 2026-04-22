# Veritas Truth Engine Global Release Plan

Version: 1.0  
Last updated: April 18, 2026  
Owner: Release Manager  
Scope: Consolidated package at `veritas_truth_engine_v2_consolidated/veritas_truth_engine_v2_consolidated`

## 1. Release Goal

Prepare Veritas Truth Engine for global enterprise market release as a production-grade truth-assessment, review, provenance, and dossier platform.

The release is not ready merely because the local demo works. Global market readiness requires verified security controls, tenant isolation, production persistence, durable processing, operational observability, deployment repeatability, compliance artifacts, and current operator documentation.

## 2. Current Baseline

As of April 18, 2026:

- Consolidated package is the primary release base.
- Local browser UI runs on port `3017`.
- Development watch mode is available through `npm run dev:ui:watch`.
- TypeScript check passes with `npm run check`.
- Unit smoke tests pass with `npm test`.
- Production build passes with `npm run build`.
- Running server verification is available through `npm run verify:server`.
- Root CI runs check, tests, build, and running-server smoke verification for the consolidated package.
- Local JSON repository and PostgreSQL enterprise repository both exist.
- Operations Manual, Deployment Runbook, and Global Market Readiness checklist exist.

Known release constraints:

- Runtime target is Node.js `>=22 <23`; development machines using newer Node versions may work but are outside the declared support range.
- API key protection is acceptable for controlled demos, not full production identity and authorization.
- Async ingestion currently completes during the request lifecycle rather than through a durable worker.
- Database schema is SQL-bootstrap based and does not yet have migration versioning or drift checks.
- Browser end-to-end checks exist as development artifacts but are not committed as CI gates.
- Docker and PostgreSQL mode must be validated in the target environment before release-candidate status.
- Current PostgreSQL schemas and repository paths must be aligned before Docker/Postgres mode can be promoted.
- Tenant and user context are currently process-global and must become authenticated request context before public deployment.

## 3. Operating Rules

1. Every major product, API, security, deployment, or operations change must update `docs/veritas_operations_manual.md` in the same change set.
2. Every release-readiness change must update this plan or `docs/GLOBAL_MARKET_READINESS.md` when status changes.
3. No production release is allowed unless `npm run check`, `npm test`, `npm run build`, and `npm run verify:server` pass.
4. No external release is allowed while authentication, authorization, tenant isolation, backup, restore, monitoring, and incident-response procedures remain unverified.
5. Dossiers remain advisory evidence products. Veritas must expose uncertainty and provenance; it must not claim absolute truth.

## 4. Workstreams

### Workstream A: Product Stabilization

Goal: make the current app reliable for real reviewers and tenant administrators.

Steps:

1. Convert browser smoke checks into committed Playwright tests.
2. Add UI tests for ingestion, assessment, review action, dossier preview, enterprise state, and API-key operation.
3. Add accessibility checks for the primary operating screens.
4. Add search and filtering for review tasks, audit events, and export history.
5. Add explicit empty, loading, error, and retry states for all major panels.

Exit criteria:

- Browser test suite runs locally and in CI.
- No known console errors on initial load, ingestion, review, or export.
- Core workflows are stable on desktop and mobile viewport checks.

### Workstream B: Security And Identity

Goal: replace demo-grade API-key gating with production-grade access control.

Steps:

1. Select the target identity provider and deployment model.
2. Add authenticated session handling or signed bearer-token verification.
3. Enforce route-level authorization for operator, reviewer, tenant administrator, release manager, and security administrator roles.
4. Bind audit actors to authenticated identities instead of local/demo actors.
5. Add rate limiting for ingestion, export, auth-sensitive, and administrative endpoints.
6. Add CSRF protections if browser cookie sessions are used.
7. Add malware scanning hooks and file-type validation for uploads.
8. Document secret storage and rotation procedures.

Exit criteria:

- API key mode is documented as demo/local only.
- Every API route has an authorization decision.
- Audit logs identify the real actor.
- Security tests cover unauthorized, wrong-role, and cross-tenant attempts.

### Workstream C: Tenant Isolation And Persistence

Goal: prove enterprise data boundaries and persistence behavior.

Steps:

1. Add PostgreSQL integration tests using the enterprise schema.
2. Add tenant isolation tests for ingestions, jobs, reviews, dossiers, audit logs, users, and tenant switches.
3. Add migration tooling with versioned schema changes.
4. Add drift detection for deployed databases.
5. Add tenant export, retention, and deletion workflows.
6. Add regional policy enforcement by tenant.

Exit criteria:

- PostgreSQL mode is covered by automated integration tests.
- Cross-tenant reads and writes are blocked by tests.
- Schema version and migration state are observable.
- Backup and restore are tested against a real PostgreSQL database.

### Workstream D: Durable Processing

Goal: move long-running work out of request-bound execution.

Steps:

1. Define durable job states, leases, retry policy, cancellation, and dead-letter handling.
2. Add a worker process for ingestion, export, and future OCR jobs.
3. Add idempotency keys for ingestion and export requests.
4. Add job timeout and stuck-job detection.
5. Add operator controls for retry, cancel, and inspect.

Exit criteria:

- Ingestion request enqueues work and returns a durable job.
- Worker can resume after process restart.
- Failed jobs are inspectable and retryable.
- Duplicate submissions are safely handled.

### Workstream E: Observability And Operations

Goal: make the system operable in staging and production.

Steps:

1. Add metrics endpoint or telemetry export.
2. Add centralized log shipping guidance and structured event taxonomy.
3. Add alert thresholds for failed jobs, unauthorized spikes, database outage, high latency, and stuck workers.
4. Add operator dashboard requirements.
5. Add runbooks for degraded database, failed worker, bad deployment, secret rotation, and suspected data exposure.

Exit criteria:

- Operators can see health, readiness, job status, request failures, auth failures, and database status.
- Alerts exist for release-blocking conditions.
- Incident response steps are documented and tested.

### Workstream F: Deployment And Release Engineering

Goal: make staging and production deployments repeatable.

Steps:

1. Validate `npm run docker:config`.
2. Validate `npm run docker:build`.
3. Validate `npm run docker:up` with PostgreSQL mode.
4. Add staging deployment configuration.
5. Add production deployment configuration with TLS, domain, secrets, and backup integration.
6. Add rollback procedure and release tagging.
7. Add CI gates for check, tests, build, browser tests, Docker build, and server smoke verification.

Exit criteria:

- A clean machine can deploy the app from documented steps.
- Staging deployment passes all release gates.
- Rollback is tested.
- CI blocks incomplete releases.

### Workstream G: Compliance And Market Package

Goal: prepare procurement, legal, and security review materials.

Steps:

1. Generate SBOM.
2. Complete license review.
3. Draft privacy, data retention, deletion, and legal hold policies.
4. Build security-questionnaire package.
5. Prepare penetration-test readiness checklist.
6. Prepare customer-facing deployment and data-flow diagrams.
7. Define support, SLA, incident notification, and vulnerability disclosure processes.

Exit criteria:

- Enterprise buyers can review security, privacy, and operational controls.
- Legal and procurement blockers are known and tracked.
- Compliance artifacts match the deployed product.

## 5. Milestones

### Milestone 1: Release Foundation

Deliverables:

- Release plan committed.
- Operations Manual updated with release discipline and live development workflow.
- Quality gates pass locally.
- Current readiness blockers listed and prioritized.

Status: In progress.

### Milestone 2: Testable Product Candidate

Deliverables:

- Playwright browser tests committed.
- CI runs check, tests, build, browser tests, and server smoke verification.
- Docker build and Compose validated.
- Node 22 environment verified.

Status: Not started.

### Milestone 3: Enterprise Persistence Candidate

Deliverables:

- PostgreSQL integration test suite.
- Tenant isolation test suite.
- Migration tooling.
- Backup and restore validation.

Status: Not started.

### Milestone 4: Secure Staging Candidate

Deliverables:

- Production authentication.
- Route-level authorization.
- Authenticated audit actors.
- Rate limiting and upload scanning hooks.
- Staging deployment with TLS and secrets.

Status: Not started.

### Milestone 5: Operational Release Candidate

Deliverables:

- Durable worker.
- Metrics and alerting.
- Operator dashboards or equivalent operational views.
- Incident runbooks.
- Rollback tested.

Status: Not started.

### Milestone 6: Global Market Release

Deliverables:

- Compliance package.
- Security review and penetration-test readiness.
- Privacy, retention, deletion, and legal hold policies.
- Support process and release notes.
- Final release approval.

Status: Not started.

## 6. Release Candidate Definition

Veritas Truth Engine reaches release-candidate status only when:

1. All automated gates pass in CI.
2. Docker image and Compose stack are validated.
3. PostgreSQL mode is tested end to end.
4. Tenant isolation tests pass.
5. Production authentication and route authorization are enforced.
6. Durable jobs are implemented.
7. Monitoring, alerting, backup, restore, and rollback are tested.
8. Compliance and procurement artifacts exist.
9. Operations Manual and Deployment Runbook match the shipped product.

## 7. Immediate Execution Backlog

Priority order:

1. Add committed Playwright browser test suite.
2. Validate Docker build and Compose stack.
3. Align PostgreSQL schemas and repositories for all active API routes.
4. Add PostgreSQL integration tests.
5. Add tenant isolation tests.
6. Move tenant/user context from process-global state to authenticated request context.
7. Add migration tooling.
8. Design and implement production authentication and authorization.
9. Add durable worker architecture.
10. Add telemetry and alerting.
11. Build compliance package.

## 8. Agent Operating Model

Use parallel agents for bounded work:

- Technical readiness agent: audits code, runtime, tests, security, persistence, and release blockers.
- Documentation and market readiness agent: audits manuals, runbooks, market documents, compliance gaps, and release process.
- Implementation agents: each owns a non-overlapping file or module set when making code changes.
- Verification agent: runs independent checks after implementation work lands.

Agents must not revert unrelated changes. Any agent that edits code must list changed files and verification performed.
