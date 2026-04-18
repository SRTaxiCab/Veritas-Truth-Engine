import { buildWorkspaceSnapshot, InMemoryReviewRepository } from "../review/repository";
import { ReviewerWorkspaceService } from "../review/workspace-service";
import { resolveMentionWithHeuristics } from "../entity/model-assisted-resolver";
import type { CanonicalEntity, EntityMention } from "../entity/types";

const repo = new InMemoryReviewRepository();
const service = new ReviewerWorkspaceService(repo);

export async function buildDemoReviewerWorkspace() {
  const entities: CanonicalEntity[] = [
    { id: "ent_1", name: "John Fitzgerald Kennedy", type: "person", aliases: ["JFK"], metadata: {} },
    { id: "ent_2", name: "John F. Kennedy", type: "person", aliases: ["President Kennedy"], metadata: {} },
    { id: "ent_3", name: "Central Intelligence Agency", type: "organization", aliases: ["CIA"], metadata: {} },
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

  return buildWorkspaceSnapshot(repo);
}
