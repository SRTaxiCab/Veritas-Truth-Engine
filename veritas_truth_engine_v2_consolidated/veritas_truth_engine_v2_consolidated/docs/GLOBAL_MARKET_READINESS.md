# Veritas Truth Engine Global Market Readiness Checklist

This checklist tracks the work required to move Veritas Truth Engine from a strong local product build to a production-ready product for global enterprise markets.

Execution plan:

```text
docs/GLOBAL_RELEASE_PLAN.md
```

Every major product, API, security, deployment, or operations change must update `docs/veritas_operations_manual.md` in the same change set.

Status key:

- `[x]` Complete for the current local/product baseline.
- `[~]` Partially complete and needs hardening.
- `[ ]` Not started or not production-grade yet.

## 1. Product Baseline

- [x] Production build starts with `npm start`.
- [x] Local UI runs at `http://localhost:3017`.
- [x] Ingestion, claim extraction, evidence binding, review queue, dossier, jobs, and enterprise panel are functional.
- [x] Operations Manual is downloadable as Markdown and PDF.
- [x] Deployment Runbook exists.
- [x] Logo and brand assets are served from project assets.

## 2. Quality Gates

- [x] TypeScript check: `npm run check`.
- [x] Unit smoke tests: `npm test`.
- [x] Production build: `npm run build`.
- [x] Running-server smoke test: `npm run verify:server`.
- [x] CI workflow runs check, tests, build, and running-server smoke verification.
- [~] Browser checks are available through Playwright scripts used during development.
- [ ] Browser end-to-end tests are committed as repeatable CI tests.

## 3. Security

- [x] Security headers are applied.
- [x] Request body size limit is configurable.
- [x] Optional `VERITAS_API_KEY` protects API routes.
- [x] Browser UI can store and send the API key.
- [x] Public assets and manual downloads remain available without API credentials.
- [~] API-key mode is suitable for controlled deployments and demos.
- [ ] Replace API key with production authentication.
- [ ] Add role-based authorization per route.
- [ ] Bind audit actor to authenticated identity.
- [ ] Add rate limiting.
- [ ] Add CSRF/session protections if browser sessions are used.
- [ ] Add malware scanning hook for uploaded files.

## 4. Tenant And Data Isolation

- [x] Local tenant control plane exists.
- [x] Enterprise repository abstraction exists.
- [~] Postgres repository implements core tenant-aware workflows.
- [ ] Postgres mode has full integration test coverage.
- [ ] Tenant isolation tests prove no cross-tenant reads or writes.
- [ ] Tenant data export and deletion workflows exist.
- [ ] Regional data policy is enforceable by tenant.

## 5. Persistence And Migrations

- [x] Local JSON persistence exists for development.
- [x] Enterprise Postgres schema exists.
- [x] Docker Compose is configured to bootstrap Postgres with the enterprise schema.
- [~] Schema is currently SQL bootstrap based.
- [ ] Add migration versioning.
- [ ] Add rollback/drift strategy.
- [ ] Add production seed scripts.
- [ ] Add backup and restore automation.

## 6. Jobs And Processing

- [x] Job records exist for async ingestion.
- [x] Job monitor exists in the UI.
- [~] Async ingestion currently completes during the HTTP request.
- [ ] Add durable worker process.
- [ ] Add job leases and retries.
- [ ] Add cancellation.
- [ ] Add dead-letter handling.
- [ ] Add idempotency keys.

## 7. Observability And Operations

- [x] `/healthz` exists.
- [x] `/readyz` exists.
- [x] Responses include `x-request-id`.
- [x] HTTP requests emit structured JSON logs.
- [ ] Add centralized log shipping.
- [ ] Add metrics endpoint or telemetry integration.
- [ ] Add alert thresholds for failed jobs, unauthorized spikes, stuck jobs, and database outage.
- [ ] Add operator dashboard.

## 8. Deployment

- [x] Dockerfile exists.
- [x] Docker Compose exists.
- [x] Compose configuration validates with `npm run docker:config`.
- [~] Docker build is blocked locally until Docker Desktop Linux backend is working.
- [ ] Validate `npm run docker:build`.
- [ ] Validate `npm run docker:up`.
- [ ] Add staging deployment.
- [ ] Add production deployment.
- [ ] Add rollback procedure.
- [ ] Add domain and TLS configuration.

## 9. Product UX

- [x] Primary operating surface exists.
- [x] Ingestion workflow is usable.
- [x] Review workflow is usable.
- [x] Dossier export workflow is usable.
- [x] Enterprise control plane is usable locally.
- [~] API key operation is usable for secured demos.
- [ ] Add onboarding wizard.
- [ ] Add review search/filtering.
- [ ] Add export history.
- [ ] Add audit log filtering and export.
- [ ] Add accessibility audit.
- [ ] Add mobile layout test coverage.

## 10. Compliance And Procurement

- [x] Operations Manual documents current controls.
- [x] Deployment Runbook documents current deployment path.
- [~] Audit log exists, but immutability/export strategy needs production hardening.
- [ ] Data retention policy.
- [ ] Privacy and terms support.
- [ ] Legal hold support.
- [ ] SBOM generation.
- [ ] License review.
- [ ] Security questionnaire package.
- [ ] Penetration-test readiness checklist.

## Immediate Next Milestones

1. Add committed Playwright browser tests.
2. Validate Docker build and the full Compose stack.
3. Align PostgreSQL schemas and repositories for all active API routes.
4. Validate Postgres mode end to end and add integration tests.
5. Add tenant isolation tests.
6. Move tenant/user context from process-global state to authenticated request context.
7. Replace API-key protection with real authentication and route-level authorization.
8. Add durable background worker for ingestion and exports.
9. Add migration tooling and database drift checks.
10. Add log/metric export for staging.

## Release Candidate Definition

Veritas Truth Engine can enter release-candidate status when:

- All quality gates pass in CI.
- Docker build and Compose run are validated.
- Postgres mode is fully tested.
- Authentication and authorization are production-grade.
- Tenant isolation tests pass.
- Durable jobs are implemented.
- Monitoring, backup, restore, and rollback are tested.
- Operations Manual and Deployment Runbook match the deployed product.
