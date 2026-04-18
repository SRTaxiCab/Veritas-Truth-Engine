
# Veritas Truth Engine v2 Full Scaffold

This package expands the Truth Engine v2 starter into a fuller repo scaffold with service wiring, example persistence abstractions, a demo HTTP server, a sample assessment payload, and a Next.js App Router example.

It is intended as the adjudication core for ChronoScope and broader Veritas Systems products where truth assessment depends on evidence, provenance, source independence, contradiction structure, temporal coherence, and deception-aware scoring. This direction matches the Veritas blueprint and the Rediscover.ai / DeceptionOS concept documents. fileciteturn0file0 fileciteturn0file1

## Added in this package

- `src/lib/repository.ts` — repository interface + in-memory implementation
- `src/lib/service.ts` — service orchestration for assess + persist + review queue
- `src/examples/sample-input.ts` — reusable ChronoScope-style sample claim package
- `src/examples/server.ts` — minimal local demo server
- `app/api/assess-claim/route.ts` — Next.js App Router example endpoint
- `app/truth-engine-demo/page.tsx` — basic UI page for testing in a Next.js app
- `.env.example` — environment placeholders

## Quick start

```bash
npm install
npm run build
npm run demo
npm run dev:ui
```

Then open `http://localhost:3017` for the demo page.

## Suggested next implementation steps

1. Replace the in-memory repository with PostgreSQL persistence.
2. Wire claim and evidence extraction into your ingestion pipeline.
3. Add reviewer override workflows and audit logging.
4. Expose provenance graphs and contradiction graphs in ChronoScope UI.
5. Calibrate priors and thresholds against benchmark corpora.

## Important note

This remains a serious engineering scaffold, not a final omniscient engine. The correct product goal is rigorous, explainable adjudication under uncertainty.
