import { randomUUID } from "node:crypto";
import { buildWorkspaceSnapshot } from "../review/repository.js";
import { getEnterpriseRepository } from "../lib/enterprise-repository-factory.js";
import { ReviewerWorkspaceService } from "../review/workspace-service.js";
import { resolveMentionWithHeuristics } from "../entity/model-assisted-resolver.js";
import type { CanonicalEntity, EntityMention } from "../entity/types.js";
import type { ReviewAction } from "../review/types.js";

export async function buildDemoReviewerWorkspace() {
  const repo = getEnterpriseRepository();
  const service = new ReviewerWorkspaceService(repo);
  const existing = await repo.listTasks();
  if (existing.length) {
    return buildWorkspaceSnapshot(repo);
  }

  const entities: CanonicalEntity[] = [
    {
      id: "ent_1",
      canonicalName: "John Fitzgerald Kennedy",
      normalizedName: "john fitzgerald kennedy",
      entityType: "person",
      aliases: ["JFK"],
      confidence: 0.96,
      provenance: ["seeded_demo_registry"],
    },
    {
      id: "ent_2",
      canonicalName: "John F. Kennedy",
      normalizedName: "john f kennedy",
      entityType: "person",
      aliases: ["President Kennedy"],
      confidence: 0.81,
      provenance: ["seeded_demo_registry"],
    },
    {
      id: "ent_3",
      canonicalName: "Central Intelligence Agency",
      normalizedName: "central intelligence agency",
      entityType: "organization",
      aliases: ["CIA"],
      confidence: 0.94,
      provenance: ["seeded_demo_registry"],
    },
  ];

  const mention: EntityMention = {
    id: "m_1",
    text: "President John Kennedy",
    type: "person",
    sourceId: "src_demo",
    claimId: "clm_demo",
  };

  const decision = resolveMentionWithHeuristics(mention, entities);
  if (decision.decision === "needs_review") {
    await service.createEntityResolutionTask({
      mentionText: mention.text,
      mentionId: mention.id,
      decision,
    });
  }

  await repo.createTask({
    id: "review_claim_public_impact_demo",
    type: "claim_assessment",
    status: "open",
    priority: "critical",
    subjectId: "clm_hist_001",
    title: "Validate public-impact claim before release",
    summary:
      "The seeded assessment requires review because the claim has public impact, contradiction pressure, and a release gate of review_required.",
    payload: {
      claimId: "clm_hist_001",
      reasons: ["public_impact_claim", "elevated_contradiction_pressure", "review_required"],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignedTo: null,
  });

  return buildWorkspaceSnapshot(repo);
}

export async function reviewerWorkspaceHandler() {
  return buildWorkspaceSnapshot(getEnterpriseRepository());
}

export async function applyReviewActionHandler(payload: {
  taskId: string;
  reviewer?: string;
  decision: ReviewAction["decision"] | "start_review";
  notes?: string;
}) {
  const repo = getEnterpriseRepository();
  if (!payload.taskId) {
    throw new Error("taskId is required.");
  }

  if (payload.decision === "start_review") {
    const task = await repo.updateTask(payload.taskId, {
      status: "in_review",
      assignedTo: payload.reviewer || "local_reviewer",
    });
    return { ok: true, task, snapshot: await buildWorkspaceSnapshot(repo) };
  }

  const action: ReviewAction = {
    taskId: payload.taskId,
    reviewer: payload.reviewer || "local_reviewer",
    decision: payload.decision,
    notes: payload.notes,
    createdAt: new Date().toISOString(),
    payload: { actionId: randomUUID() },
  };
  await repo.appendAction(action);
  const task = await repo.updateTask(payload.taskId, {
    status: payload.decision === "deferred" ? "in_review" : "resolved",
  });

  return { ok: true, task, action, snapshot: await buildWorkspaceSnapshot(repo) };
}
