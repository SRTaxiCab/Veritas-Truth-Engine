import { Pool } from "pg";

let cachedPool: Pool | null = null;

export function getPgPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (!cachedPool) {
    cachedPool = new Pool({
      connectionString,
      max: 10,
      ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
    });
  }

  return cachedPool;
}

export async function closePgPool(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
  }
}
