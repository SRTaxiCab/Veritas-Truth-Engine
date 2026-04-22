export type IntegrationDirection = "inbound" | "outbound" | "bidirectional";
export type IntegrationLifecycle = "planned" | "experimental" | "active";
export type IntegrationHealthStatus = "standby" | "configured" | "connected" | "error";

export type IntegrationDescriptor = {
  id: string;
  name: string;
  description: string;
  lifecycle: IntegrationLifecycle;
  direction: IntegrationDirection;
  enabled: boolean;
  capabilities: string[];
  notes?: string[];
};

export type IntegrationHealth = {
  status: IntegrationHealthStatus;
  configured: boolean;
  connected: boolean;
  summary: string;
  details?: Record<string, unknown>;
};

export type IntegrationStatusSnapshot = IntegrationDescriptor & {
  health: IntegrationHealth;
};

export interface IntegrationAdapter {
  readonly id: string;
  describe(): IntegrationDescriptor;
  healthCheck(): Promise<IntegrationHealth>;
}
