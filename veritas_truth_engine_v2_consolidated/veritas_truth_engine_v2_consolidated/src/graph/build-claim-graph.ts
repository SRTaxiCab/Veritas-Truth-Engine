import type { Claim, ClaimRelation, EvaluateClaimInput } from "../core/types.js";
import { resolveEntitiesFromClaims } from "../entity/resolver.js";
import type { ClaimGraph, GraphEdge, GraphNode } from "./types.js";

function addNode(nodes: GraphNode[], node: GraphNode): void {
  if (!nodes.some((existing) => existing.id === node.id)) {
    nodes.push(node);
  }
}

function claimNode(claim: Claim): GraphNode {
  return {
    id: claim.id,
    kind: "claim",
    label: claim.claimText,
    group: claim.modality,
    metadata: {
      predicate: claim.predicate,
      truthWindowStart: claim.timeStart ?? null,
      truthWindowEnd: claim.timeEnd ?? null,
      publicImpact: !!claim.publicImpact
    }
  };
}

export function buildClaimGraph(input: EvaluateClaimInput): ClaimGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  addNode(nodes, claimNode(input.claim));

  const relatedClaims: Claim[] = [{
    ...input.claim
  }];

  const entityResolution = resolveEntitiesFromClaims(relatedClaims);

  for (const entity of entityResolution.entities) {
    addNode(nodes, {
      id: entity.id,
      kind: "entity",
      label: entity.canonicalName,
      group: entity.entityType,
      metadata: {
        aliases: entity.aliases,
        confidence: entity.confidence
      }
    });
  }

  for (const claim of relatedClaims) {
    if (claim.subject) {
      const entityId = entityResolution.aliasToEntityId[claim.subject] ?? entityResolution.aliasToEntityId[claim.subject.toLowerCase()];
      if (entityId) {
        edges.push({
          id: `${claim.id}_subject_${entityId}`,
          source: claim.id,
          target: entityId,
          type: "mentions",
          weight: 1
        });
      }
    }

    if (claim.object) {
      const entityId = entityResolution.aliasToEntityId[claim.object] ?? entityResolution.aliasToEntityId[claim.object.toLowerCase()];
      if (entityId) {
        edges.push({
          id: `${claim.id}_object_${entityId}`,
          source: claim.id,
          target: entityId,
          type: "mentions",
          weight: 0.9
        });
      }
    }
  }

  for (const bundle of input.evidence) {
    const sourceId = bundle.source.id;
    addNode(nodes, {
      id: sourceId,
      kind: "source",
      label: bundle.source.title,
      group: bundle.source.sourceType,
      metadata: {
        reliabilityPrior: bundle.source.reliabilityPrior,
        primarySource: bundle.source.primarySource
      }
    });

    edges.push({
      id: `${input.claim.id}_${sourceId}_${bundle.span.id}`,
      source: input.claim.id,
      target: sourceId,
      type: bundle.span.evidenceRole === "contradicting" ? "contradicted_by" : "supported_by",
      weight: Math.max(bundle.source.reliabilityPrior, 0.1),
      metadata: {
        evidenceRole: bundle.span.evidenceRole,
        quotedText: bundle.span.quotedText,
        pageNumber: bundle.span.pageNumber ?? null
      }
    });
  }

  for (const relation of input.claimRelations ?? []) {
    edges.push(relationToGraphEdge(relation));
  }

  return { nodes, edges };
}

function relationToGraphEdge(relation: ClaimRelation): GraphEdge {
  return {
    id: `${relation.fromClaimId}_${relation.toClaimId}_${relation.relationType}`,
    source: relation.fromClaimId,
    target: relation.toClaimId,
    type: relation.relationType === "contradicts" || relation.relationType === "temporally_conflicts"
      ? "contradicts"
      : "supports",
    weight: relation.confidence,
    metadata: {
      relationType: relation.relationType
    }
  };
}
