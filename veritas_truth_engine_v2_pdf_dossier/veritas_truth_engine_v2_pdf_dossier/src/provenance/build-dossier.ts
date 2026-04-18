import { EvidenceBundle, TruthAssessment, Claim } from "../core/types";
import { ReviewTask } from "../review/types";
import {
  ProvenanceDossierSection,
  ProvenanceEdge,
  ProvenanceGraphPayload,
  ProvenanceNode,
  ProvenancePathStep,
} from "./types";

function truncate(value: string, max = 96): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

export function buildProvenanceDossierSection(
  claim: Claim,
  assessment: TruthAssessment,
  evidence: EvidenceBundle[],
  reviewTasks: ReviewTask[] = []
): ProvenanceDossierSection {
  const pathSteps: ProvenancePathStep[] = [];
  const sourceTitles = [...new Set(evidence.map((bundle) => bundle.source.title))];

  evidence.slice(0, 8).forEach((bundle, index) => {
    pathSteps.push({
      step: pathSteps.length + 1,
      fromLabel: truncate(claim.claimText),
      relation: bundle.span.evidenceRole === "contradicting" ? "contradicted by" : "supported by",
      toLabel: truncate(bundle.source.title),
      note: truncate(bundle.span.quotedText, 140),
    });

    pathSteps.push({
      step: pathSteps.length + 1,
      fromLabel: truncate(bundle.source.title),
      relation: "assessed as",
      toLabel: assessment.truthState,
      note: `Posterior truth score ${assessment.posteriorTruthScore.toFixed(3)}`,
    });
  });

  if (reviewTasks.length > 0) {
    pathSteps.push({
      step: pathSteps.length + 1,
      fromLabel: truncate(claim.claimText),
      relation: "queued for review",
      toLabel: reviewTasks[0].type,
      note: reviewTasks.map((task) => String(task.payload?.["reasonCode"] ?? task.summary)).join(", "),
    });
  }

  return {
    claimId: claim.id,
    claimText: claim.claimText,
    pathSteps,
    sourceTitles,
    contradictionCount: evidence.filter((bundle) => bundle.span.evidenceRole === "contradicting").length,
    reviewRequired: reviewTasks.length > 0 || assessment.releaseState !== "auto_release",
  };
}

export function buildProvenanceGraphPayload(input: {
  claims: Claim[];
  assessments: TruthAssessment[];
  evidenceByClaimId: Record<string, EvidenceBundle[]>;
  reviewTasksByClaimId?: Record<string, ReviewTask[]>;
}): ProvenanceGraphPayload {
  const nodes: ProvenanceNode[] = [];
  const edges: ProvenanceEdge[] = [];
  const dossiers: ProvenanceDossierSection[] = [];

  const assessmentMap = new Map(input.assessments.map((assessment) => [assessment.claimId, assessment]));

  for (const claim of input.claims) {
    const assessment = assessmentMap.get(claim.id);
    if (!assessment) continue;

    const evidence = input.evidenceByClaimId[claim.id] ?? [];
    const reviewTasks = input.reviewTasksByClaimId?.[claim.id] ?? [];

    nodes.push({
      id: `claim:${claim.id}`,
      type: "claim",
      label: truncate(claim.claimText),
      detail: claim.canonicalFingerprint,
      weight: assessment.posteriorTruthScore,
    });

    nodes.push({
      id: `assessment:${claim.id}`,
      type: "assessment",
      label: assessment.truthState,
      detail: `score=${assessment.posteriorTruthScore.toFixed(3)} release=${assessment.releaseState}`,
      weight: assessment.posteriorTruthScore,
    });

    edges.push({
      id: `edge:claim-assessment:${claim.id}`,
      from: `claim:${claim.id}`,
      to: `assessment:${claim.id}`,
      relation: "assessed_by",
      strength: assessment.posteriorTruthScore,
    });

    evidence.forEach((bundle) => {
      const evidenceNodeId = `evidence:${bundle.span.id}`;
      const sourceNodeId = `source:${bundle.source.id}`;

      nodes.push({
        id: evidenceNodeId,
        type: "evidence",
        label: truncate(bundle.span.quotedText, 80),
        detail: `role=${bundle.span.evidenceRole}`,
      });

      nodes.push({
        id: sourceNodeId,
        type: "source",
        label: truncate(bundle.source.title, 60),
        detail: `${bundle.source.sourceType} | reliability=${bundle.source.reliabilityPrior.toFixed(2)}`,
        weight: bundle.source.reliabilityPrior,
      });

      edges.push({
        id: `edge:claim-evidence:${claim.id}:${bundle.span.id}`,
        from: `claim:${claim.id}`,
        to: evidenceNodeId,
        relation: bundle.span.evidenceRole === "contradicting" ? "contradicted_by" : "supported_by",
        strength: bundle.source.reliabilityPrior,
      });

      edges.push({
        id: `edge:evidence-source:${bundle.span.id}:${bundle.source.id}`,
        from: evidenceNodeId,
        to: sourceNodeId,
        relation: "derived_from",
      });
    });

    reviewTasks.forEach((task) => {
      const reviewNodeId = `review_task:${task.id}`;
      nodes.push({
        id: reviewNodeId,
        type: "review_task",
        label: task.type,
        detail: `${task.priority} | ${String(task.payload?.["reasonCode"] ?? task.summary)}`,
      });
      edges.push({
        id: `edge:claim-review:${claim.id}:${task.id}`,
        from: `claim:${claim.id}`,
        to: reviewNodeId,
        relation: "queued_for_review",
      });
    });

    dossiers.push(buildProvenanceDossierSection(claim, assessment, evidence, reviewTasks));
  }

  return {
    nodes: dedupeById(nodes),
    edges,
    dossiers,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}
