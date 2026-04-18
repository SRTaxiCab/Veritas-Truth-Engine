import type { ClaimReportRecord } from "../reports/types.js";
import type { ReviewAction, ReviewTask, ReviewerWorkspaceSnapshot } from "../review/types.js";
import type { AuditLogEntry, EnterpriseJob, JobType, StoreUser, StoredIngestion, Tenant } from "./local-store.js";
import type { IngestDocumentResult } from "./document-ingestion-service.js";

export interface EnterpriseAdminState {
  ok: true;
  activeTenant: Tenant;
  activeUser: StoreUser;
  tenants: Tenant[];
  users: StoreUser[];
  metrics: {
    ingestions: number;
    claims: number;
    openReviews: number;
    runningJobs: number;
    auditEvents: number;
  };
}

export interface EnterpriseRepository {
  mode: "local" | "postgres";
  isConfigured(): boolean;
  adminState(): Promise<EnterpriseAdminState>;
  createTenant(input: { name: string; region?: Tenant["region"]; plan?: Tenant["plan"] }): Promise<Tenant>;
  setActiveTenant(tenantId: string): Promise<Tenant>;
  createUser(input: { email: string; displayName: string; role: StoreUser["role"] }): Promise<StoreUser>;
  audit(action: string, resourceType: string, resourceId: string, summary: string, metadata: Record<string, unknown>): Promise<AuditLogEntry>;
  auditLog(): Promise<AuditLogEntry[]>;
  createJob(input: { type: JobType; title: string; payload: Record<string, unknown> }): Promise<EnterpriseJob>;
  updateJob(jobId: string, patch: Partial<EnterpriseJob>): Promise<EnterpriseJob | null>;
  listJobs(): Promise<EnterpriseJob[]>;
  getJob(jobId: string): Promise<EnterpriseJob | null>;
  saveIngestion(result: IngestDocumentResult): Promise<StoredIngestion>;
  listIngestions(): Promise<StoredIngestion[]>;
  latestReportRecords(): Promise<ClaimReportRecord[]>;
  reviewerWorkspace(): Promise<ReviewerWorkspaceSnapshot>;
  listTasks(): Promise<ReviewTask[]>;
  createTask(task: ReviewTask): Promise<ReviewTask>;
  updateTask(taskId: string, patch: Partial<ReviewTask>): Promise<ReviewTask | null>;
  appendAction(action: ReviewAction): Promise<void>;
  listActions(taskId: string): Promise<ReviewAction[]>;
}
