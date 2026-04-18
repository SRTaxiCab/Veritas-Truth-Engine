export type ReviewTaskType =
  | "entity_resolution"
  | "claim_assessment"
  | "contradiction_resolution"
  | "provenance_verification";

export type ReviewDecision =
  | "approved"
  | "rejected"
  | "needs_changes"
  | "deferred";

export interface ReviewTask {
  id: string;
  type: ReviewTaskType;
  status: "open" | "in_review" | "resolved";
  priority: "low" | "normal" | "high" | "critical";
  subjectId: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  assignedTo?: string | null;
}

export interface ReviewAction {
  taskId: string;
  reviewer: string;
  decision: ReviewDecision;
  notes?: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface ReviewerWorkspaceSnapshot {
  openTasks: ReviewTask[];
  inReviewTasks: ReviewTask[];
  resolvedTasks: ReviewTask[];
}
