# Reviewer Workspace Layer

This layer introduces human adjudication into Truth Engine v2.

## Purpose

The reviewer workspace exists for cases where automated truth adjudication should not be the final arbiter:

- ambiguous entity resolution
- weakly separated contradiction candidates
- provenance gaps
- high-impact contested claims

## Components

- `model-assisted-resolver.ts`
  - deterministic matching with review thresholds
  - candidate ranking and rationale capture
- `review/repository.ts`
  - review task persistence abstraction
- `review/workspace-service.ts`
  - creation and resolution of adjudication tasks
- `app/reviewer-workspace/page.tsx`
  - basic UI lane view for open / in-review / resolved items

## Review doctrine

The engine should auto-resolve only when confidence is clearly high and provenance is adequate.
Everything else should be reviewable, auditable, and reversible.
