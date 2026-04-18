# Entity Resolution Layer

This phase adds a lightweight entity resolution layer to the Truth Engine.

## Purpose

ChronoScope cannot reconstruct historical truth at scale if every alias is treated as a new actor. The entity resolution layer:

- normalizes surface forms
- clusters aliases into canonical entities
- preserves provenance from claims to entity nodes
- supports contradiction and timeline graph visualization

## Current strategy

The current implementation is intentionally conservative and deterministic:

- text normalization
- stopword trimming
- alias clustering using normalized equality and high Jaccard overlap
- basic type inference for organization, document, place, and unknown

## Why this matters

Entity resolution is where historical research platforms either become coherent or collapse into duplication. This layer is the start of:

- person/organization alias collapse
- institutional lineage tracing
- document family grouping
- contradiction clustering by actor
- geotemporal reconstruction
