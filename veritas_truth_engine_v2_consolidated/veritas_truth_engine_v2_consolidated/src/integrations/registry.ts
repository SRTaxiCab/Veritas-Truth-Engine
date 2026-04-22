import { chronoscopeAdapter } from "./chronoscope/adapter.js";
import type { IntegrationAdapter, IntegrationStatusSnapshot } from "./types.js";

const registeredIntegrations: readonly IntegrationAdapter[] = [
  chronoscopeAdapter,
];

export function listIntegrationAdapters(): readonly IntegrationAdapter[] {
  return registeredIntegrations;
}

export async function listIntegrationStatuses(): Promise<IntegrationStatusSnapshot[]> {
  return Promise.all(
    registeredIntegrations.map(async (adapter) => ({
      ...adapter.describe(),
      health: await adapter.healthCheck(),
    }))
  );
}
