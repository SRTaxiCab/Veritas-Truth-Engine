import { randomUUID } from "crypto";
import { ReviewAction, ReviewTask } from "./types";
import { ReviewRepository } from "./repository";
import { ResolutionDecision } from "../entity/model-assisted-resolver";

export class ReviewerWorkspaceService {
  constructor(private readonly reviewRepo: ReviewRepository) {}

  async createEntityResolutionTask(input: {
    mentionText: string;
    mentionId: string;
    decision: ResolutionDecision;
  }): Promise<ReviewTask> {
    const now = new Date().toISOString();
    return this.reviewRepo.createTask({
      id: randomUUID(),
      type: "entity_resolution",
      status: "open",
      priority: input.decision.confidence > 0.85 ? "normal" : "high",
      subjectId: input.mentionId,
      title: `Resolve entity: ${input.mentionText}`,
      summary: `Ambiguous entity resolution for "${input.mentionText}" with confidence ${input.decision.confidence.toFixed(2)}.`,
      payload: {
        mention: input.decision.mention,
        candidates: input.decision.candidateScores,
        rationale: input.decision.rationale,
      },
      createdAt: now,
      updatedAt: now,
      assignedTo: null,
    });
  }

  async resolveTask(input: {
    taskId: string;
    reviewer: string;
    decision: ReviewAction["decision"];
    notes?: string;
    payload?: Record<string, unknown>;
  }) {
    const action: ReviewAction = {
      taskId: input.taskId,
      reviewer: input.reviewer,
      decision: input.decision,
      notes: input.notes,
      payload: input.payload,
      createdAt: new Date().toISOString(),
    };
    await this.reviewRepo.appendAction(action);
    const status = input.decision === "deferred" ? "in_review" : "resolved";
    return this.reviewRepo.updateTask(input.taskId, { status });
  }
}
