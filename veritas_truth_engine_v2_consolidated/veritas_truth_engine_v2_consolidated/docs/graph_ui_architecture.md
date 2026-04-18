# Contradiction Graph UI Architecture

This phase adds a graph-oriented interface layer to the Truth Engine package.

## Objective

Expose truth adjudication as a visual structure instead of a hidden score.

The graph layer represents:

- claims
- entities
- sources
- support links
- contradiction links
- temporal events

## Graph model

### Nodes
- claim
- entity
- source

### Edges
- mentions
- supported_by
- contradicted_by
- supports
- contradicts
- temporal_order

## ChronoScope relevance

ChronoScope is fundamentally a historical reconstruction platform. A contradiction graph is required to show:

- where the archival record aligns
- where witness and institutional narratives diverge
- which sources are primary vs derivative
- how claims evolve over time

## Current implementation

This package includes:

- graph payload builder
- timeline payload builder
- API helper
- demo page showing a lightweight SVG graph

## Recommended next step

Replace the static demo page with:

- real API-backed graph data
- force-layout or dagre layout
- node detail panel
- source span preview drawer
- assessment overlays
