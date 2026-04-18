import type { Pool, PoolClient } from "pg";
import type { ClaimReportRecord } from "../reports/types.js";
import type { ReviewAction, ReviewerWorkspaceSnapshot, ReviewTask } from "../review/types.js";
import type { AuditLogEntry, EnterpriseJob, JobType, JobStatus, StoreUser, StoredIngestion, Tenant } from "./local-store.js";
import type { IngestDocumentResult } from "./document-ingestion-service.js";
import type { EnterpriseAdminState, EnterpriseRepository } from "./enterprise-repository.js";

type DbTenant = {
  id: string;
  name: string;
  slug: string;
  plan: Tenant["plan"];
  region: Tenant["region"];
  status: Tenant["status"];
  created_at: string;
};

type DbUser = {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  role: StoreUser["role"];
  status: StoreUser["status"];
  created_at: string;
};

type DbAudit = {
  id: string;
  tenant_id: string;
  actor_id: string;
  actor_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type DbJob = {
  id: string;
  tenant_id: string;
  actor_id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  title: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type DbIngestion = {
  tenant_id: string;
  created_by: string;
  created_at: string;
  payload: StoredIngestion;
};

type DbReviewTask = {
  id: string;
  external_id: string;
  tenant_id: string;
  type: ReviewTask["type"];
  status: ReviewTask["status"];
  priority: ReviewTask["priority"];
  subject_id: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

type DbReviewAction = {
  task_external_id: string;
  reviewer_email: string;
  decision: ReviewAction["decision"];
  notes: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function tenant(row: DbTenant): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    region: row.region,
    status: row.status,
    createdAt: row.created_at,
  };
}

function user(row: DbUser): StoreUser {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

function audit(row: DbAudit): AuditLogEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    summary: row.summary,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function job(row: DbJob): EnterpriseJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    title: row.title,
    payload: row.payload ?? {},
    result: row.result,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function reviewTask(row: DbReviewTask): ReviewTask {
  return {
    id: row.external_id,
    type: row.type,
    status: row.status,
    priority: row.priority,
    subjectId: row.subject_id,
    title: row.title,
    summary: row.summary,
    payload: row.payload ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedTo: row.assigned_to,
  };
}

function reviewAction(row: DbReviewAction): ReviewAction {
  return {
    taskId: row.task_external_id,
    reviewer: row.reviewer_email,
    decision: row.decision,
    notes: row.notes ?? undefined,
    payload: row.payload ?? {},
    createdAt: row.created_at,
  };
}

function num(value: number | undefined | null): string | null {
  return typeof value === "number" ? value.toFixed(4) : null;
}

export class PostgresEnterpriseRepository implements EnterpriseRepository {
  readonly mode = "postgres" as const;
  private activeTenantId: string | null;
  private activeUserId: string | null;

  constructor(private readonly pool: Pool, options?: { activeTenantId?: string; activeUserId?: string }) {
    this.activeTenantId = options?.activeTenantId ?? process.env.VERITAS_TENANT_ID ?? null;
    this.activeUserId = options?.activeUserId ?? process.env.VERITAS_USER_ID ?? null;
  }

  isConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL);
  }

  private async ensureContext(): Promise<{ tenant: Tenant; actor: StoreUser }> {
    if (this.activeTenantId) {
      const tenantResult = await this.pool.query<DbTenant>("select * from tenants where id = $1", [this.activeTenantId]);
      if (tenantResult.rows[0]) {
        const users = await this.pool.query<DbUser>(
          "select * from tenant_users where tenant_id = $1 and ($2::uuid is null or id = $2::uuid) order by created_at asc limit 1",
          [this.activeTenantId, this.activeUserId]
        );
        if (users.rows[0]) return { tenant: tenant(tenantResult.rows[0]), actor: user(users.rows[0]) };
      }
    }

    const tenants = await this.pool.query<DbTenant>("select * from tenants order by created_at asc limit 1");
    if (!tenants.rows[0]) {
      const created = await this.createTenant({ name: "Veritas Systems Internal", region: "us", plan: "enterprise" });
      const state = await this.adminState();
      return { tenant: created, actor: state.activeUser };
    }

    this.activeTenantId = tenants.rows[0].id;
    const users = await this.pool.query<DbUser>("select * from tenant_users where tenant_id = $1 order by created_at asc limit 1", [
      this.activeTenantId,
    ]);
    if (!users.rows[0]) {
      const createdUser = await this.createUser({
        email: `admin@${tenants.rows[0].slug}.local`,
        displayName: `${tenants.rows[0].name} Admin`,
        role: "admin",
      });
      return { tenant: tenant(tenants.rows[0]), actor: createdUser };
    }

    this.activeUserId = users.rows[0].id;
    return { tenant: tenant(tenants.rows[0]), actor: user(users.rows[0]) };
  }

  async adminState(): Promise<EnterpriseAdminState> {
    const ctx = await this.ensureContext();
    const tenants = await this.pool.query<DbTenant>("select * from tenants order by created_at asc");
    const users = await this.pool.query<DbUser>("select * from tenant_users where tenant_id = $1 order by created_at asc", [ctx.tenant.id]);
    const metrics = await this.pool.query<{
      ingestions: string;
      claims: string;
      open_reviews: string;
      running_jobs: string;
      audit_events: string;
    }>(
      `
      select
        (select count(*) from ingested_documents where tenant_id = $1) as ingestions,
        (select count(*) from claims where tenant_id = $1) as claims,
        (select count(*) from review_tasks where tenant_id = $1 and status = 'open') as open_reviews,
        (select count(*) from enterprise_jobs where tenant_id = $1 and status in ('queued','running')) as running_jobs,
        (select count(*) from audit_log where tenant_id = $1) as audit_events
      `,
      [ctx.tenant.id]
    );
    const row = metrics.rows[0]!;
    return {
      ok: true,
      activeTenant: ctx.tenant,
      activeUser: ctx.actor,
      tenants: tenants.rows.map(tenant),
      users: users.rows.map(user),
      metrics: {
        ingestions: Number(row.ingestions),
        claims: Number(row.claims),
        openReviews: Number(row.open_reviews),
        runningJobs: Number(row.running_jobs),
        auditEvents: Number(row.audit_events),
      },
    };
  }

  async createTenant(input: { name: string; region?: Tenant["region"]; plan?: Tenant["plan"] }): Promise<Tenant> {
    const result = await this.pool.query<DbTenant>(
      `
      insert into tenants (name, slug, plan, region)
      values ($1, $2, $3, $4)
      on conflict (slug) do update set name = excluded.name, updated_at = now()
      returning *
      `,
      [input.name, slugify(input.name), input.plan ?? "enterprise", input.region ?? "us"]
    );
    const created = tenant(result.rows[0]!);
    this.activeTenantId = created.id;
    const admin = await this.createUser({
      email: `admin@${created.slug}.local`,
      displayName: `${created.name} Admin`,
      role: "admin",
    });
    this.activeUserId = admin.id;
    await this.audit("tenant.create", "tenant", created.id, `Created tenant ${created.name}.`, {
      region: created.region,
      plan: created.plan,
    });
    return created;
  }

  async setActiveTenant(tenantId: string): Promise<Tenant> {
    const result = await this.pool.query<DbTenant>("select * from tenants where id = $1", [tenantId]);
    if (!result.rows[0]) throw new Error(`Tenant not found: ${tenantId}`);
    this.activeTenantId = tenantId;
    const users = await this.pool.query<DbUser>("select * from tenant_users where tenant_id = $1 order by created_at asc limit 1", [tenantId]);
    this.activeUserId = users.rows[0]?.id ?? null;
    const active = tenant(result.rows[0]);
    await this.audit("tenant.switch", "tenant", active.id, `Switched active tenant to ${active.name}.`, {});
    return active;
  }

  async createUser(input: { email: string; displayName: string; role: StoreUser["role"] }): Promise<StoreUser> {
    const ctx = await this.ensureContext().catch(async () => {
      const tenants = await this.pool.query<DbTenant>("select * from tenants order by created_at asc limit 1");
      if (!tenants.rows[0]) {
        const created = await this.pool.query<DbTenant>(
          "insert into tenants (name, slug, plan, region) values ($1,$2,'enterprise','us') returning *",
          ["Veritas Systems Internal", "veritas-internal"]
        );
        this.activeTenantId = created.rows[0]!.id;
      } else {
        this.activeTenantId = tenants.rows[0].id;
      }
      return this.ensureContext();
    });
    const result = await this.pool.query<DbUser>(
      `
      insert into tenant_users (tenant_id, email, display_name, role)
      values ($1, $2, $3, $4)
      on conflict (tenant_id, email) do update
        set display_name = excluded.display_name, role = excluded.role, updated_at = now()
      returning *
      `,
      [ctx.tenant.id, input.email.toLowerCase(), input.displayName, input.role]
    );
    const created = user(result.rows[0]!);
    this.activeUserId = created.id;
    await this.audit("user.upsert", "user", created.id, `Upserted user ${created.email}.`, { role: created.role });
    return created;
  }

  async audit(action: string, resourceType: string, resourceId: string, summary: string, metadata: Record<string, unknown>): Promise<AuditLogEntry> {
    const ctx = await this.ensureContext();
    const result = await this.pool.query<DbAudit>(
      `
      insert into audit_log (tenant_id, actor_id, actor_email, action, resource_type, resource_id, summary, metadata)
      values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      returning *
      `,
      [ctx.tenant.id, ctx.actor.id, ctx.actor.email, action, resourceType, resourceId, summary, JSON.stringify(metadata)]
    );
    return audit(result.rows[0]!);
  }

  async auditLog(): Promise<AuditLogEntry[]> {
    const ctx = await this.ensureContext();
    const result = await this.pool.query<DbAudit>("select * from audit_log where tenant_id = $1 order by created_at desc limit 1000", [
      ctx.tenant.id,
    ]);
    return result.rows.map(audit);
  }

  async createJob(input: { type: JobType; title: string; payload: Record<string, unknown> }): Promise<EnterpriseJob> {
    const ctx = await this.ensureContext();
    const result = await this.pool.query<DbJob>(
      `
      insert into enterprise_jobs (tenant_id, actor_id, type, status, progress, title, payload)
      values ($1,$2,$3,'queued',0,$4,$5::jsonb)
      returning *
      `,
      [ctx.tenant.id, ctx.actor.id, input.type, input.title, JSON.stringify(input.payload)]
    );
    const created = job(result.rows[0]!);
    await this.audit("job.queued", "job", created.id, `Queued job ${created.title}.`, { type: created.type });
    return created;
  }

  async updateJob(jobId: string, patch: Partial<EnterpriseJob>): Promise<EnterpriseJob | null> {
    const ctx = await this.ensureContext();
    const current = await this.pool.query<DbJob>("select * from enterprise_jobs where id = $1 and tenant_id = $2", [jobId, ctx.tenant.id]);
    if (!current.rows[0]) return null;
    const next = { ...job(current.rows[0]), ...patch };
    const result = await this.pool.query<DbJob>(
      `
      update enterprise_jobs
      set status = $3, progress = $4, result = $5::jsonb, error = $6, started_at = $7, completed_at = $8, updated_at = now()
      where id = $1 and tenant_id = $2
      returning *
      `,
      [
        jobId,
        ctx.tenant.id,
        next.status,
        next.progress,
        next.result ? JSON.stringify(next.result) : null,
        next.error ?? null,
        next.startedAt ?? null,
        next.completedAt ?? null,
      ]
    );
    const updated = job(result.rows[0]!);
    await this.audit(`job.${updated.status}`, "job", updated.id, `Job ${updated.title} is ${updated.status}.`, {
      type: updated.type,
      progress: updated.progress,
      error: updated.error,
    });
    return updated;
  }

  async listJobs(): Promise<EnterpriseJob[]> {
    const ctx = await this.ensureContext();
    const result = await this.pool.query<DbJob>("select * from enterprise_jobs where tenant_id = $1 order by created_at desc", [ctx.tenant.id]);
    return result.rows.map(job);
  }

  async getJob(jobId: string): Promise<EnterpriseJob | null> {
    const ctx = await this.ensureContext();
    const result = await this.pool.query<DbJob>("select * from enterprise_jobs where id = $1 and tenant_id = $2", [jobId, ctx.tenant.id]);
    return result.rows[0] ? job(result.rows[0]) : null;
  }

  async saveIngestion(result: IngestDocumentResult): Promise<StoredIngestion> {
    const ctx = await this.ensureContext();
    const client = await this.pool.connect();
    const stored: StoredIngestion = {
      ...result,
      tenantId: ctx.tenant.id,
      createdBy: ctx.actor.id,
      createdAt: new Date().toISOString(),
    };

    try {
      await client.query("begin");

      const sourceId = await this.upsertSource(client, ctx.tenant.id, result);
      const sourceVersionId = await this.upsertSourceVersion(client, ctx.tenant.id, sourceId, result);
      const documentId = await this.upsertIngestedDocument(client, ctx.tenant.id, ctx.actor.id, sourceVersionId, stored);
      const chunkIdByExternal = new Map<string, string>();

      for (const chunk of result.chunks) {
        const chunkId = await this.upsertChunk(client, ctx.tenant.id, documentId, chunk);
        chunkIdByExternal.set(chunk.id, chunkId);
      }

      for (const item of result.claimPackages) {
        const claimId = await this.upsertClaim(client, ctx.tenant.id, item.claim);
        const chunk = result.chunks.find(
          (candidateChunk) =>
            item.candidate.charStart >= candidateChunk.charStart && item.candidate.charEnd <= candidateChunk.charEnd
        );
        const chunkId = chunk ? chunkIdByExternal.get(chunk.id) ?? null : null;

        for (const evidence of item.evidence) {
          await this.upsertEvidenceSpan(client, ctx.tenant.id, claimId, sourceVersionId, chunkId, evidence);
        }

        await this.upsertAssessment(client, ctx.tenant.id, claimId, item.assessment);

        if (item.assessment.releaseState !== "auto_release") {
          await this.upsertReviewTask(client, ctx.tenant.id, item);
        }
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    await this.audit("document.ingest", "document", result.document.id, `Ingested ${result.document.title}.`, {
      claimCount: result.claimPackages.length,
      reviewCount: result.reviewCount,
      contentHash: result.document.contentHash,
      repository: "postgres",
    });

    return stored;
  }

  async listIngestions(): Promise<StoredIngestion[]> {
    const ctx = await this.ensureContext();
    const result = await this.pool.query<DbIngestion>(
      "select tenant_id, created_by, created_at, payload from ingested_documents where tenant_id = $1 order by created_at desc",
      [ctx.tenant.id]
    );
    return result.rows.map((row) => ({
      ...row.payload,
      tenantId: row.tenant_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
  }

  async latestReportRecords(): Promise<ClaimReportRecord[]> {
    const ingestions = await this.listIngestions();
    const tasks = await this.listTasks();
    return ingestions.flatMap((ingestion) =>
      ingestion.claimPackages.map((item) => ({
        claim: item.claim,
        assessment: item.assessment,
        evidence: item.evidence,
        reviewTasks: tasks.filter((task) => task.subjectId === item.claim.id),
      }))
    );
  }

  async reviewerWorkspace(): Promise<ReviewerWorkspaceSnapshot> {
    const tasks = await this.listTasks();
    return {
      openTasks: tasks.filter((task) => task.status === "open"),
      inReviewTasks: tasks.filter((task) => task.status === "in_review"),
      resolvedTasks: tasks.filter((task) => task.status === "resolved"),
    };
  }

  async listTasks(): Promise<ReviewTask[]> {
    const ctx = await this.ensureContext();
    const result = await this.pool.query<DbReviewTask>(
      "select * from review_tasks where tenant_id = $1 order by created_at desc",
      [ctx.tenant.id]
    );
    return result.rows.map(reviewTask);
  }

  async createTask(task: ReviewTask): Promise<ReviewTask> {
    const ctx = await this.ensureContext();
    const result = await this.pool.query<DbReviewTask>(
      `
      insert into review_tasks (
        tenant_id, external_id, type, status, priority, subject_id, title, summary, payload, assigned_to
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
      on conflict (tenant_id, external_id) do update set
        type = excluded.type,
        status = excluded.status,
        priority = excluded.priority,
        subject_id = excluded.subject_id,
        title = excluded.title,
        summary = excluded.summary,
        payload = excluded.payload,
        assigned_to = excluded.assigned_to,
        updated_at = now()
      returning *
      `,
      [
        ctx.tenant.id,
        task.id,
        task.type,
        task.status,
        task.priority,
        task.subjectId,
        task.title,
        task.summary,
        JSON.stringify(task.payload ?? {}),
        task.assignedTo ?? null,
      ]
    );
    const created = reviewTask(result.rows[0]!);
    await this.audit("review.task.upsert", "review_task", created.id, `Upserted review task ${created.title}.`, {
      status: created.status,
      priority: created.priority,
    });
    return created;
  }

  async updateTask(taskId: string, patch: Partial<ReviewTask>): Promise<ReviewTask | null> {
    const ctx = await this.ensureContext();
    const current = await this.pool.query<DbReviewTask>("select * from review_tasks where tenant_id = $1 and external_id = $2", [
      ctx.tenant.id,
      taskId,
    ]);
    if (!current.rows[0]) return null;
    const next: ReviewTask = { ...reviewTask(current.rows[0]), ...patch, updatedAt: new Date().toISOString() };
    const result = await this.pool.query<DbReviewTask>(
      `
      update review_tasks
      set type = $3,
          status = $4,
          priority = $5,
          subject_id = $6,
          title = $7,
          summary = $8,
          payload = $9::jsonb,
          assigned_to = $10,
          updated_at = now()
      where tenant_id = $1 and external_id = $2
      returning *
      `,
      [
        ctx.tenant.id,
        taskId,
        next.type,
        next.status,
        next.priority,
        next.subjectId,
        next.title,
        next.summary,
        JSON.stringify(next.payload ?? {}),
        next.assignedTo ?? null,
      ]
    );
    const updated = reviewTask(result.rows[0]!);
    await this.audit("review.task.update", "review_task", updated.id, `Updated review task ${updated.title}.`, {
      status: updated.status,
      priority: updated.priority,
    });
    return updated;
  }

  async appendAction(action: ReviewAction): Promise<void> {
    const ctx = await this.ensureContext();
    const task = await this.pool.query<{ id: string }>("select id from review_tasks where tenant_id = $1 and external_id = $2", [
      ctx.tenant.id,
      action.taskId,
    ]);
    if (!task.rows[0]) throw new Error(`Review task not found: ${action.taskId}`);
    await this.pool.query(
      `
      insert into review_actions (tenant_id, task_id, reviewer_id, reviewer_email, decision, notes, payload, created_at)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      `,
      [
        ctx.tenant.id,
        task.rows[0].id,
        ctx.actor.id,
        action.reviewer,
        action.decision,
        action.notes ?? null,
        JSON.stringify(action.payload ?? {}),
        action.createdAt,
      ]
    );
    await this.audit("review.action.append", "review_task", action.taskId, `Recorded ${action.decision} review action.`, {
      reviewer: action.reviewer,
      decision: action.decision,
    });
  }

  async listActions(taskId: string): Promise<ReviewAction[]> {
    const ctx = await this.ensureContext();
    const result = await this.pool.query<DbReviewAction>(
      `
      select rt.external_id as task_external_id, ra.reviewer_email, ra.decision, ra.notes, ra.payload, ra.created_at
      from review_actions ra
      join review_tasks rt on rt.id = ra.task_id
      where ra.tenant_id = $1 and rt.external_id = $2
      order by ra.created_at asc
      `,
      [ctx.tenant.id, taskId]
    );
    return result.rows.map(reviewAction);
  }

  private async upsertSource(client: PoolClient, tenantId: string, result: IngestDocumentResult): Promise<string> {
    const source = result.source;
    const inserted = await client.query<{ id: string }>(
      `
      insert into sources (
        tenant_id, external_id, title, source_type, origin, author, publisher, published_at, acquired_at,
        reliability_prior, chain_of_custody_score, primary_source
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      on conflict (tenant_id, external_id) do update set
        title = excluded.title,
        source_type = excluded.source_type,
        origin = excluded.origin,
        reliability_prior = excluded.reliability_prior,
        chain_of_custody_score = excluded.chain_of_custody_score
      returning id
      `,
      [
        tenantId,
        source.id,
        source.title,
        source.sourceType,
        source.origin ?? null,
        source.author ?? null,
        source.publisher ?? null,
        source.publishedAt ?? null,
        source.acquiredAt ?? null,
        num(source.reliabilityPrior),
        num(source.chainOfCustodyScore),
        source.primarySource,
      ]
    );
    return inserted.rows[0]!.id;
  }

  private async upsertSourceVersion(
    client: PoolClient,
    tenantId: string,
    sourceId: string,
    result: IngestDocumentResult
  ): Promise<string> {
    const sourceVersion = result.sourceVersion;
    const inserted = await client.query<{ id: string }>(
      `
      insert into source_versions (
        tenant_id, external_id, source_id, version_number, extraction_method, extraction_confidence, content_hash
      )
      values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (tenant_id, external_id) do update set
        extraction_method = excluded.extraction_method,
        extraction_confidence = excluded.extraction_confidence,
        content_hash = excluded.content_hash
      returning id
      `,
      [
        tenantId,
        sourceVersion.id,
        sourceId,
        sourceVersion.versionNumber,
        sourceVersion.extractionMethod ?? null,
        num(sourceVersion.extractionConfidence ?? null),
        sourceVersion.contentHash,
      ]
    );
    return inserted.rows[0]!.id;
  }

  private async upsertIngestedDocument(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    sourceVersionId: string,
    stored: StoredIngestion
  ): Promise<string> {
    const doc = stored.document;
    const inserted = await client.query<{ id: string }>(
      `
      insert into ingested_documents (
        tenant_id, external_id, source_version_id, title, mime_type, parser_name, parser_version,
        content_hash, content_text, payload, created_by
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
      on conflict (tenant_id, external_id) do update set
        title = excluded.title,
        mime_type = excluded.mime_type,
        parser_name = excluded.parser_name,
        parser_version = excluded.parser_version,
        content_hash = excluded.content_hash,
        content_text = excluded.content_text,
        payload = excluded.payload
      returning id
      `,
      [
        tenantId,
        doc.id,
        sourceVersionId,
        doc.title,
        doc.mimeType,
        doc.parserName,
        doc.parserVersion,
        doc.contentHash,
        doc.contentText,
        JSON.stringify(stored),
        actorId,
      ]
    );
    return inserted.rows[0]!.id;
  }

  private async upsertChunk(client: PoolClient, tenantId: string, documentId: string, chunk: IngestDocumentResult["chunks"][number]): Promise<string> {
    const inserted = await client.query<{ id: string }>(
      `
      insert into document_chunks (
        tenant_id, external_id, ingested_document_id, chunk_index, page_number, section_label,
        char_start, char_end, text_content, content_hash
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (tenant_id, external_id) do update set
        text_content = excluded.text_content,
        content_hash = excluded.content_hash
      returning id
      `,
      [
        tenantId,
        chunk.id,
        documentId,
        chunk.chunkIndex,
        chunk.pageNumber ?? null,
        chunk.sectionLabel ?? null,
        chunk.charStart,
        chunk.charEnd,
        chunk.text,
        chunk.contentHash,
      ]
    );
    return inserted.rows[0]!.id;
  }

  private async upsertClaim(client: PoolClient, tenantId: string, claim: IngestDocumentResult["claimPackages"][number]["claim"]): Promise<string> {
    const inserted = await client.query<{ id: string }>(
      `
      insert into claims (
        tenant_id, external_id, claim_text, subject, predicate, object, polarity, modality,
        canonical_fingerprint, public_impact
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (tenant_id, external_id) do update set
        claim_text = excluded.claim_text,
        subject = excluded.subject,
        predicate = excluded.predicate,
        object = excluded.object,
        polarity = excluded.polarity,
        modality = excluded.modality,
        public_impact = excluded.public_impact
      returning id
      `,
      [
        tenantId,
        claim.id,
        claim.claimText,
        claim.subject ?? null,
        claim.predicate,
        claim.object ?? null,
        claim.polarity,
        claim.modality,
        claim.canonicalFingerprint,
        Boolean(claim.publicImpact),
      ]
    );
    return inserted.rows[0]!.id;
  }

  private async upsertEvidenceSpan(
    client: PoolClient,
    tenantId: string,
    claimId: string,
    sourceVersionId: string,
    chunkId: string | null,
    evidence: IngestDocumentResult["claimPackages"][number]["evidence"][number]
  ): Promise<void> {
    await client.query(
      `
      insert into evidence_spans (
        tenant_id, external_id, claim_id, source_version_id, document_chunk_id, quoted_text,
        evidence_role, char_start, char_end, extraction_confidence, span_hash
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sha256:' || encode(digest($6, 'sha256'), 'hex'))
      on conflict (tenant_id, external_id) do update set
        quoted_text = excluded.quoted_text,
        evidence_role = excluded.evidence_role,
        extraction_confidence = excluded.extraction_confidence
      `,
      [
        tenantId,
        evidence.span.id,
        claimId,
        sourceVersionId,
        chunkId,
        evidence.span.quotedText,
        evidence.span.evidenceRole,
        evidence.span.charStart ?? null,
        evidence.span.charEnd ?? null,
        num(evidence.span.extractionConfidence ?? null),
      ]
    );
  }

  private async upsertAssessment(
    client: PoolClient,
    tenantId: string,
    claimId: string,
    assessment: IngestDocumentResult["claimPackages"][number]["assessment"]
  ): Promise<void> {
    await client.query(
      `
      insert into truth_assessments (
        tenant_id, external_id, claim_id, model_version, posterior_truth_score, confidence_band,
        truth_state, release_state, features, explanation
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)
      on conflict (tenant_id, external_id) do update set
        posterior_truth_score = excluded.posterior_truth_score,
        confidence_band = excluded.confidence_band,
        truth_state = excluded.truth_state,
        release_state = excluded.release_state,
        features = excluded.features,
        explanation = excluded.explanation
      `,
      [
        tenantId,
        `assessment_${assessment.claimId}_${assessment.modelVersion}`,
        claimId,
        assessment.modelVersion,
        num(assessment.posteriorTruthScore),
        num(assessment.confidenceBand),
        assessment.truthState,
        assessment.releaseState,
        JSON.stringify(assessment.features),
        JSON.stringify(assessment.explanation),
      ]
    );
  }

  private async upsertReviewTask(
    client: PoolClient,
    tenantId: string,
    item: IngestDocumentResult["claimPackages"][number]
  ): Promise<void> {
    const reasons = item.assessment.explanation.reviewReasons;
    const priority = reasons.includes("public_impact_claim")
      ? "critical"
      : reasons.includes("elevated_contradiction_pressure")
      ? "high"
      : "normal";
    await client.query(
      `
      insert into review_tasks (
        tenant_id, external_id, type, status, priority, subject_id, title, summary, payload
      )
      values ($1,$2,'claim_assessment','open',$3,$4,$5,$6,$7::jsonb)
      on conflict (tenant_id, external_id) do update set
        priority = excluded.priority,
        summary = excluded.summary,
        payload = excluded.payload,
        updated_at = now()
      `,
      [
        tenantId,
        `review_${tenantId}_${item.claim.id}`,
        priority,
        item.claim.id,
        `Review claim: ${item.claim.claimText.slice(0, 80)}`,
        [
          `Release gate: ${item.assessment.releaseState}.`,
          `Truth state: ${item.assessment.truthState}.`,
          `Reasons: ${reasons.join(", ") || "manual validation required"}.`,
        ].join(" "),
        JSON.stringify({
          tenantId,
          claimId: item.claim.id,
          assessment: item.assessment,
          evidence: item.evidence,
          candidate: item.candidate,
        }),
      ]
    );
  }
}
