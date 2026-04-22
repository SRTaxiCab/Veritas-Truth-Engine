import type { IntegrationAdapter, IntegrationDescriptor, IntegrationHealth } from "../types.js";

export class ChronoScopeAdapter implements IntegrationAdapter {
  readonly id = "chronoscope";

  describe(): IntegrationDescriptor {
    return {
      id: this.id,
      name: "ChronoScope",
      description: "Reserved downstream adapter boundary for future ChronoScope integration.",
      lifecycle: "planned",
      direction: "bidirectional",
      enabled: false,
      capabilities: [],
      notes: [
        "Veritas runs as a standalone product by default.",
        "No ChronoScope transport, auth, or data contract is active yet.",
        "Implement this adapter only after the standalone Veritas surface is production-ready.",
      ],
    };
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return {
      status: "standby",
      configured: false,
      connected: false,
      summary: "ChronoScope integration is intentionally inactive. This adapter exists only as a future boundary.",
      details: {
        adapterPath: "src/integrations/chronoscope",
        activationModel: "manual implementation required",
        currentMode: "standalone_veritas",
      },
    };
  }
}

export const chronoscopeAdapter = new ChronoScopeAdapter();
