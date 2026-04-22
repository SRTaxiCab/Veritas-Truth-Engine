import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ClaimReportRecord } from "../reports/types.js";
import type { ReviewAction, ReviewTask } from "../review/types.js";
import type { ReviewRepository } from "../review/repository.js";
import { buildWorkspaceSnapshot } from "../review/repository.js";
import type { IngestDocumentResult } from "./document-ingestion-service.js";
import type { EnterpriseAdminState, EnterpriseRepository } from "./enterprise-repository.js";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: "enterprise" | "regulated" | "internal";
  region: "us" | "eu" | "global";
  status: "active" | "suspended";
  createdAt: string;
}

export interface StoreUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: "admin" | "analyst" | "reviewer" | "auditor" | "read_only";
  status: "active" | "disabled";
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorId: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type JobType = "document_ingestion" | "report_export" | "dossier_export" | "ocr_extraction";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface EnterpriseJob {
  id: string;
  tenantId: string;
  actorId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  title: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface StoredIngestion extends IngestDocumentResult {
  tenantId: string;
  createdBy: string;
  createdAt: string;
}

export interface VeritasStoreState {
  version: 3;
  activeTenantId: string;
  activeUserId: string;
  tenants: Tenant[];
  users: StoreUser[];
  ingestions: StoredIngestion[];
  reviewTasks: ReviewTask[];
  reviewActions: ReviewAction[];
  jobs: EnterpriseJob[];
  auditLog: AuditLogEntry[];
}

const STORE_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(STORE_DIR, "veritas-store.json");
const DEFAULT_TENANT_ID = "tenant_veritas_default";
const DEFAULT_USER_ID = "user_local_admin";

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string, seed?: string): string {
  const raw = seed ?? crypto.randomUUID();
  return `${prefix}_${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16)}`;
}

function defaultTenant(): Tenant {
  return {
    id: DEFAULT_TENANT_ID,
    name: "Veritas Systems Internal",
    slug: "veritas-internal",
    plan: "enterprise",
    region: "us",
    status: "active",
    createdAt: now(),
  };
}

function defaultUser(): StoreUser {
  return {
    id: DEFAULT_USER_ID,
    tenantId: DEFAULT_TENANT_ID,
    email: "admin@veritas.local",
    displayName: "Local Admin",
    role: "admin",
    status: "active",
    createdAt: now(),
  };
}

function emptyState(): VeritasStoreState {
  return {
    version: 3,
    activeTenantId: DEFAULT_TENANT_ID,
    activeUserId: DEFAULT_USER_ID,
    tenants: [defaultTenant()],
    users: [defaultUser()],
    ingestions: [],
    reviewTasks: [],
    reviewActions: [],
    jobs: [],
    auditLog: [],
  };
}

function priorityFor(reasons: string[]): ReviewTask["priority"] {
  if (reasons.includes("high_deception_signal") || reasons.includes("public_impact_claim")) return "critical";
  if (reasons.includes("elevated_contradiction_pressure") || reasons.includes("weak_provenance_integrity")) return "high";
  return "normal";
}

function taskTenantId(task: ReviewTask): string {
  return typeof task.payload.tenantId === "string" ? task.payload.tenantId : DEFAULT_TENANT_ID;
}

export class LocalVeritasStore implements ReviewRepository, EnterpriseRepository {
  readonly mode = "local" as const;
  private state: VeritasStoreState;

  constructor(private readonly storePath = STORE_PATH) {
    this.state = this.load();
  }

  private load(): VeritasStoreState {
    if (!fs.existsSync(this.storePath)) {
      return emptyState();
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.storePath, "utf8")) as Partial<VeritasStoreState>;
      const base = emptyState();
      const activeTenantId = parsed.activeTenantId ?? DEFAULT_TENANT_ID;
      const activeUserId = parsed.activeUserId ?? DEFAULT_USER_ID;
      return {
        version: 3,
        activeTenantId,
        activeUserId,
        tenants: parsed.tenants?.length ? parsed.tenants : base.tenants,
        users: parsed.users?.length ? parsed.users : base.users,
        ingestions: (parsed.ingestions ?? []).map((ingestion) => ({
          ...ingestion,
          tenantId: ingestion.tenantId ?? activeTenantId,
          createdBy: ingestion.createdBy ?? activeUserId,
        })) as StoredIngestion[],
        reviewTasks: (parsed.reviewTasks ?? []).map((task) => ({
          ...task,
          payload: {
            tenantId: taskTenantId(task),
            ...task.payload,
          },
        })),
        reviewActions: parsed.reviewActions ?? [],
        jobs: (parsed.jobs ?? []).map((job) => ({
          ...job,
          tenantId: job.tenantId ?? activeTenantId,
          actorId: job.actorId ?? activeUserId,
        })) as EnterpriseJob[],
        auditLog: parsed.auditLog ?? [],
      };
    } catch {
      return emptyState();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  isConfigured(): boolean {
    return true;
  }

  activeTenant(): Tenant {
    return this.state.tenants.find((tenant) => tenant.id === this.state.activeTenantId) ?? this.state.tenants[0]!;
  }

  activeUser(): StoreUser {
    return (
      this.state.users.find((user) => user.id === this.state.activeUserId && user.tenantId === this.activeTenant().id) ??
      this.state.users.find((user) => user.tenantId === this.activeTenant().id) ??
      this.state.users[0]!
    );
  }

  async adminState(): Promise<EnterpriseAdminState> {
    const tenantId = this.activeTenant().id;
    const ingestions = this.state.ingestions.filter((item) => item.tenantId === tenantId);
    return {
      ok: true,
      activeTenant: this.activeTenant(),
      activeUser: this.activeUser(),
      tenants: this.state.tenants,
      users: this.state.users.filter((user) => user.tenantId === tenantId),
      metrics: {
        ingestions: ingestions.length,
        claims: ingestions.reduce((sum, ingestion) => sum + ingestion.claimPackages.length, 0),
        openReviews: this.state.reviewTasks.filter((task) => taskTenantId(task) === tenantId && task.status === "open").length,
        runningJobs: this.state.jobs.filter((job) => job.tenantId === tenantId && ["queued", "running"].includes(job.status)).length,
        auditEvents: this.state.auditLog.filter((entry) => entry.tenantId === tenantId).length,
      },
    };
  }

  async setActiveTenant(tenantId: string): Promise<Tenant> {
    const tenant = this.state.tenants.find((item) => item.id === tenantId);
    if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);
    this.state.activeTenantId = tenant.id;
    const user = this.state.users.find((item) => item.tenantId === tenant.id);
    if (user) this.state.activeUserId = user.id;
    this.audit("tenant.switch", "tenant", tenant.id, `Switched active tenant to ${tenant.name}.`, {});
    this.save();
    return tenant;
  }

  async createTenant(input: { name: string; region?: Tenant["region"]; plan?: Tenant["plan"] }): Promise<Tenant> {
    const tenant: Tenant = {
      id: id("tenant", input.name.toLowerCase()),
      name: input.name,
      slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      region: input.region ?? "us",
      plan: input.plan ?? "enterprise",
      status: "active",
      createdAt: now(),
    };

    if (!this.state.tenants.some((item) => item.id === tenant.id)) {
      this.state.tenants.push(tenant);
      this.state.users.push({
        id: id("user", `${tenant.id}:admin`),
        tenantId: tenant.id,
        email: `admin@${tenant.slug}.local`,
        displayName: `${tenant.name} Admin`,
        role: "admin",
        status: "active",
        createdAt: now(),
      });
    }

    this.state.activeTenantId = tenant.id;
    this.state.activeUserId = this.state.users.find((user) => user.tenantId === tenant.id)!.id;
    this.audit("tenant.create", "tenant", tenant.id, `Created tenant ${tenant.name}.`, { region: tenant.region, plan: tenant.plan });
    this.save();
    return tenant;
  }

  async createUser(input: { email: string; displayName: string; role: StoreUser["role"] }): Promise<StoreUser> {
    const tenant = this.activeTenant();
    const user: StoreUser = {
      id: id("user", `${tenant.id}:${input.email.toLowerCase()}`),
      tenantId: tenant.id,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      role: input.role,
      status: "active",
      createdAt: now(),
    };

    const index = this.state.users.findIndex((item) => item.id === user.id);
    if (index >= 0) {
      this.state.users[index] = { ...this.state.users[index]!, ...user };
    } else {
      this.state.users.push(user);
    }

    this.audit("user.upsert", "user", user.id, `Upserted user ${user.email}.`, { role: user.role });
    this.save();
    return user;
  }

  async removeUser(userId: string): Promise<StoreUser> {
    const tenant = this.activeTenant();
    const tenantUsers = this.state.users.filter((item) => item.tenantId === tenant.id);
    const user = tenantUsers.find((item) => item.id === userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    if (tenantUsers.length <= 1) {
      throw new Error("You cannot remove the last user in a tenant.");
    }

    this.state.users = this.state.users.filter((item) => item.id !== userId);
    if (this.state.activeUserId === userId) {
      this.state.activeUserId = this.state.users.find((item) => item.tenantId === tenant.id)!.id;
    }

    this.audit("user.remove", "user", user.id, `Removed user ${user.email}.`, { role: user.role });
    this.save();
    return user;
  }

  async audit(action: string, resourceType: string, resourceId: string, summary: string, metadata: Record<string, unknown>): Promise<AuditLogEntry> {
    const tenant = this.activeTenant();
    const actor = this.activeUser();
    const entry: AuditLogEntry = {
      id: id("audit"),
      tenantId: tenant.id,
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      resourceType,
      resourceId,
      summary,
      metadata,
      createdAt: now(),
    };
    this.state.auditLog.unshift(entry);
    this.state.auditLog = this.state.auditLog.slice(0, 1000);
    return entry;
  }

  async auditLog(): Promise<AuditLogEntry[]> {
    const tenantId = this.activeTenant().id;
    return this.state.auditLog.filter((entry) => entry.tenantId === tenantId);
  }

  async createJob(input: {
    type: JobType;
    title: string;
    payload: Record<string, unknown>;
  }): Promise<EnterpriseJob> {
    const tenant = this.activeTenant();
    const actor = this.activeUser();
    const job: EnterpriseJob = {
      id: id("job"),
      tenantId: tenant.id,
      actorId: actor.id,
      type: input.type,
      status: "queued",
      progress: 0,
      title: input.title,
      payload: input.payload,
      result: null,
      error: null,
      createdAt: now(),
      updatedAt: now(),
      startedAt: null,
      completedAt: null,
    };
    this.state.jobs.unshift(job);
    void this.audit("job.queued", "job", job.id, `Queued job ${job.title}.`, { type: job.type });
    this.save();
    return job;
  }

  async updateJob(jobId: string, patch: Partial<EnterpriseJob>): Promise<EnterpriseJob | null> {
    const tenantId = this.activeTenant().id;
    const index = this.state.jobs.findIndex((job) => job.id === jobId && job.tenantId === tenantId);
    if (index < 0) return null;

    const next: EnterpriseJob = {
      ...this.state.jobs[index]!,
      ...patch,
      updatedAt: now(),
    };
    this.state.jobs[index] = next;
    void this.audit(`job.${next.status}`, "job", next.id, `Job ${next.title} is ${next.status}.`, {
      type: next.type,
      progress: next.progress,
      error: next.error ?? null,
    });
    this.save();
    return next;
  }

  async listJobs(): Promise<EnterpriseJob[]> {
    const tenantId = this.activeTenant().id;
    return this.state.jobs
      .filter((job) => job.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getJob(jobId: string): Promise<EnterpriseJob | null> {
    const tenantId = this.activeTenant().id;
    return this.state.jobs.find((job) => job.id === jobId && job.tenantId === tenantId) ?? null;
  }

  async saveIngestion(result: IngestDocumentResult): Promise<StoredIngestion> {
    const tenant = this.activeTenant();
    const actor = this.activeUser();
    const stored: StoredIngestion = {
      ...result,
      tenantId: tenant.id,
      createdBy: actor.id,
      createdAt: now(),
    };

    const existingIndex = this.state.ingestions.findIndex((item) => item.document.id === result.document.id && item.tenantId === tenant.id);
    if (existingIndex >= 0) {
      this.state.ingestions[existingIndex] = stored;
    } else {
      this.state.ingestions.unshift(stored);
    }

    for (const item of result.claimPackages) {
      if (item.assessment.releaseState === "auto_release") continue;

      const reasons = item.assessment.explanation.reviewReasons;
      const task: ReviewTask = {
        id: `review_${tenant.id}_${item.claim.id}`,
        type: "claim_assessment",
        status: "open",
        priority: priorityFor(reasons),
        subjectId: item.claim.id,
        title: `Review claim: ${item.claim.claimText.slice(0, 80)}`,
        summary: [
          `Release gate: ${item.assessment.releaseState}.`,
          `Truth state: ${item.assessment.truthState}.`,
          `Reasons: ${reasons.join(", ") || "manual validation required"}.`,
        ].join(" "),
        payload: {
          tenantId: tenant.id,
          documentId: result.document.id,
          claimId: item.claim.id,
          assessment: item.assessment,
          evidence: item.evidence,
          candidate: item.candidate,
        },
        createdAt: now(),
        updatedAt: now(),
        assignedTo: null,
      };

      const taskIndex = this.state.reviewTasks.findIndex((existing) => existing.id === task.id);
      if (taskIndex >= 0) {
        this.state.reviewTasks[taskIndex] = {
          ...this.state.reviewTasks[taskIndex],
          ...task,
          status: this.state.reviewTasks[taskIndex]!.status,
          updatedAt: now(),
        };
      } else {
        this.state.reviewTasks.unshift(task);
      }
    }

    void this.audit("document.ingest", "document", result.document.id, `Ingested ${result.document.title}.`, {
      claimCount: result.claimPackages.length,
      reviewCount: result.reviewCount,
      contentHash: result.document.contentHash,
    });
    this.save();
    return stored;
  }

  async listIngestions(): Promise<StoredIngestion[]> {
    const tenantId = this.activeTenant().id;
    return this.state.ingestions
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getIngestion(documentId: string): StoredIngestion | null {
    const tenantId = this.activeTenant().id;
    return this.state.ingestions.find((item) => item.document.id === documentId && item.tenantId === tenantId) ?? null;
  }

  async latestReportRecords(): Promise<ClaimReportRecord[]> {
    const tenantId = this.activeTenant().id;
    return this.state.ingestions
      .filter((ingestion) => ingestion.tenantId === tenantId)
      .flatMap((ingestion) =>
        ingestion.claimPackages.map((item) => ({
          claim: item.claim,
          assessment: item.assessment,
          evidence: item.evidence,
          reviewTasks: this.state.reviewTasks.filter((task) => taskTenantId(task) === tenantId && task.subjectId === item.claim.id),
        }))
      );
  }

  async listTasks(): Promise<ReviewTask[]> {
    const tenantId = this.activeTenant().id;
    return this.state.reviewTasks
      .filter((task) => taskTenantId(task) === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createTask(task: ReviewTask): Promise<ReviewTask> {
    const tenantId = this.activeTenant().id;
    const scopedTask: ReviewTask = {
      ...task,
      id: task.id.startsWith(`review_${tenantId}_`) ? task.id : `review_${tenantId}_${task.id}`,
      payload: { tenantId, ...task.payload },
    };
    const index = this.state.reviewTasks.findIndex((existing) => existing.id === scopedTask.id);
    if (index >= 0) {
      this.state.reviewTasks[index] = scopedTask;
    } else {
      this.state.reviewTasks.unshift(scopedTask);
    }
    void this.audit("review.create", "review_task", scopedTask.id, `Created review task ${scopedTask.title}.`, { priority: scopedTask.priority });
    this.save();
    return scopedTask;
  }

  async updateTask(taskId: string, patch: Partial<ReviewTask>): Promise<ReviewTask | null> {
    const tenantId = this.activeTenant().id;
    const index = this.state.reviewTasks.findIndex((task) => task.id === taskId && taskTenantId(task) === tenantId);
    if (index < 0) return null;

    const next = {
      ...this.state.reviewTasks[index]!,
      ...patch,
      payload: {
        ...this.state.reviewTasks[index]!.payload,
        ...(patch.payload ?? {}),
        tenantId,
      },
      updatedAt: now(),
    };
    this.state.reviewTasks[index] = next;
    void this.audit("review.update", "review_task", taskId, `Updated review task ${taskId}.`, { status: next.status, assignedTo: next.assignedTo });
    this.save();
    return next;
  }

  async appendAction(action: ReviewAction): Promise<void> {
    this.state.reviewActions.unshift(action);
    void this.audit("review.action", "review_task", action.taskId, `Recorded review decision ${action.decision}.`, {
      reviewer: action.reviewer,
      notes: action.notes ?? null,
    });
    this.save();
  }

  async listActions(taskId: string): Promise<ReviewAction[]> {
    return this.state.reviewActions.filter((action) => action.taskId === taskId);
  }

  async reviewerWorkspace() {
    return buildWorkspaceSnapshot(this);
  }
}

export const localVeritasStore = new LocalVeritasStore();
