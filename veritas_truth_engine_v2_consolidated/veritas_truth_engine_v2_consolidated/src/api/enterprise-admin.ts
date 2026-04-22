import type { StoreUser, Tenant } from "../lib/local-store.js";
import { getEnterpriseRepository } from "../lib/enterprise-repository-factory.js";

export async function enterpriseAdminStateHandler() {
  return getEnterpriseRepository().adminState();
}

export async function auditLogHandler() {
  return {
    ok: true,
    auditLog: await getEnterpriseRepository().auditLog(),
  };
}

export async function createTenantHandler(payload: {
  name: string;
  region?: Tenant["region"];
  plan?: Tenant["plan"];
}) {
  if (!payload.name?.trim()) {
    throw new Error("Tenant name is required.");
  }

  return {
    ok: true,
    tenant: await getEnterpriseRepository().createTenant({
      name: payload.name.trim(),
      region: payload.region,
      plan: payload.plan,
    }),
    state: await getEnterpriseRepository().adminState(),
  };
}

export async function switchTenantHandler(payload: { tenantId: string }) {
  if (!payload.tenantId) {
    throw new Error("tenantId is required.");
  }

  return {
    ok: true,
    tenant: await getEnterpriseRepository().setActiveTenant(payload.tenantId),
    state: await getEnterpriseRepository().adminState(),
  };
}

export async function createUserHandler(payload: {
  email: string;
  displayName: string;
  role: StoreUser["role"];
}) {
  if (!payload.email?.trim()) {
    throw new Error("User email is required.");
  }
  if (!payload.displayName?.trim()) {
    throw new Error("Display name is required.");
  }

  return {
    ok: true,
    user: await getEnterpriseRepository().createUser({
      email: payload.email.trim(),
      displayName: payload.displayName.trim(),
      role: payload.role ?? "analyst",
    }),
    state: await getEnterpriseRepository().adminState(),
  };
}

export async function removeUserHandler(payload: { userId: string }) {
  if (!payload.userId?.trim()) {
    throw new Error("userId is required.");
  }

  return {
    ok: true,
    user: await getEnterpriseRepository().removeUser(payload.userId.trim()),
    state: await getEnterpriseRepository().adminState(),
  };
}
