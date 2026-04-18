import { getPgPool } from "./db.js";
import type { EnterpriseRepository } from "./enterprise-repository.js";
import { localVeritasStore } from "./local-store.js";
import { PostgresEnterpriseRepository } from "./postgres-enterprise-repository.js";

let cachedRepository: EnterpriseRepository | null = null;

export function getEnterpriseRepository(): EnterpriseRepository {
  if (cachedRepository) return cachedRepository;

  const requested = process.env.VERITAS_REPOSITORY ?? "local";
  if (requested === "postgres" && process.env.DATABASE_URL) {
    cachedRepository = new PostgresEnterpriseRepository(getPgPool());
    return cachedRepository;
  }

  cachedRepository = localVeritasStore;
  return cachedRepository;
}

export async function repositoryDiagnostics() {
  const repo = getEnterpriseRepository();
  const configured = repo.isConfigured();
  let state = null;
  let error: string | null = null;

  try {
    state = await repo.adminState();
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown repository diagnostics error";
  }

  return {
    ok: !error,
    mode: repo.mode,
    configured,
    databaseUrlPresent: Boolean(process.env.DATABASE_URL),
    requestedRepository: process.env.VERITAS_REPOSITORY ?? "local",
    activeTenant: state?.activeTenant ?? null,
    metrics: state?.metrics ?? null,
    error,
  };
}
