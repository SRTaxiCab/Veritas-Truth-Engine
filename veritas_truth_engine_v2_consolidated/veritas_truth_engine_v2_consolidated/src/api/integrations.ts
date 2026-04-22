import { listIntegrationStatuses } from "../integrations/registry.js";

export async function integrationStatusHandler() {
  const integrations = await listIntegrationStatuses();
  const enabledCount = integrations.filter((integration) => integration.enabled).length;

  return {
    ok: true,
    standalone: enabledCount === 0,
    enabledCount,
    totalCount: integrations.length,
    integrations,
  };
}
