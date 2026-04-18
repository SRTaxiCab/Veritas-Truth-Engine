# Consolidation Notes

## What changed in this package
- Removed build artifacts (`dist/`) to keep the repo source-first
- Removed lockfile snapshot so the package can be re-resolved cleanly
- Added `sql/schema_v2_all.sql` to bootstrap the full schema in one pass
- Standardized package metadata to `veritas-truth-engine-v2-consolidated`
- Added `npm run check` for type checking without emitting build files
- Added root-level project map for faster onboarding

## Remaining work before production
- Resolve any inherited TypeScript edge cases across all example/demo entry points
- Replace placeholder OCR with production OCR / document vision pipeline
- Add model-backed claim extraction and entity resolution
- Add authenticated reviewer roles and audit trails
- Add automated migration tooling instead of raw schema files
- Add regression suite and benchmark CI
- Add real PDF export orchestration in app/server layer
