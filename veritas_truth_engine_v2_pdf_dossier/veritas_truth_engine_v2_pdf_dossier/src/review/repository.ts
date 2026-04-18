import { ReviewAction, ReviewTask, ReviewerWorkspaceSnapshot } from "./types";

export interface ReviewRepository {
  listTasks(): Promise<ReviewTask[]>;
  createTask(task: ReviewTask): Promise<ReviewTask>;
  updateTask(taskId: string, patch: Partial<ReviewTask>): Promise<ReviewTask | null>;
  appendAction(action: ReviewAction): Promise<void>;
  listActions(taskId: string): Promise<ReviewAction[]>;
}

export class InMemoryReviewRepository implements ReviewRepository {
  private tasks = new Map<string, ReviewTask>();
  private actions = new Map<string, ReviewAction[]>();

  async listTasks(): Promise<ReviewTask[]> {
    return [...this.tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createTask(task: ReviewTask): Promise<ReviewTask> {
    this.tasks.set(task.id, task);
    return task;
  }

  async updateTask(taskId: string, patch: Partial<ReviewTask>): Promise<ReviewTask | null> {
    const current = this.tasks.get(taskId);
    if (!current) return null;
    const next: ReviewTask = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.tasks.set(taskId, next);
    return next;
  }

  async appendAction(action: ReviewAction): Promise<void> {
    const arr = this.actions.get(action.taskId) ?? [];
    arr.push(action);
    this.actions.set(action.taskId, arr);
  }

  async listActions(taskId: string): Promise<ReviewAction[]> {
    return this.actions.get(taskId) ?? [];
  }
}

export async function buildWorkspaceSnapshot(repo: ReviewRepository): Promise<ReviewerWorkspaceSnapshot> {
  const tasks = await repo.listTasks();
  return {
    openTasks: tasks.filter((t) => t.status === "open"),
    inReviewTasks: tasks.filter((t) => t.status === "in_review"),
    resolvedTasks: tasks.filter((t) => t.status === "resolved"),
  };
}
