import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const rootDir = process.cwd();
const localStorePath = path.join(rootDir, "data", "veritas-store.json");
const authStorePath = path.join(rootDir, "data", "veritas-auth-store.json");
const artifactsDir = path.join(rootDir, "artifacts");

function loadDotEnv(): void {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function resetPostgres(): Promise<string[]> {
  if (!process.env.DATABASE_URL) {
    return ["Skipped PostgreSQL reset because DATABASE_URL is not set."];
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    const tableResult = await client.query<{ tablename: string }>(`
      select tablename
      from pg_tables
      where schemaname = 'public'
      order by tablename asc
    `);

    const tableNames = tableResult.rows
      .map((row) => row.tablename)
      .filter((name) => name && !name.startsWith("pg_") && name !== "sql_features");

    if (!tableNames.length) {
      return ["No public PostgreSQL tables were found to reset."];
    }

    const qualifiedTables = tableNames.map((name) => `"public"."${name.replaceAll("\"", "\"\"")}"`).join(", ");
    await client.query(`truncate table ${qualifiedTables} restart identity cascade`);
    return [`Truncated ${tableNames.length} PostgreSQL table(s).`];
  } finally {
    await client.end();
  }
}

function resetLocalFallback(): string[] {
  const removed: string[] = [];
  if (fs.existsSync(localStorePath)) {
    fs.rmSync(localStorePath, { force: true });
    removed.push("Removed local fallback store data file.");
  }
  if (fs.existsSync(authStorePath)) {
    fs.rmSync(authStorePath, { force: true });
    removed.push("Removed local access account store file.");
  }
  return removed.length ? removed : ["No local fallback or access store files were present."];
}

function resetArtifacts(): string[] {
  if (!fs.existsSync(artifactsDir)) {
    return ["No artifact directory was present."];
  }

  const files = fs.readdirSync(artifactsDir);
  if (!files.length) {
    return ["Artifact directory was already empty."];
  }

  for (const file of files) {
    fs.rmSync(path.join(artifactsDir, file), { recursive: true, force: true });
  }
  return [`Removed ${files.length} artifact file(s) and folder(s).`];
}

async function main() {
  loadDotEnv();
  const messages = [
    ...(await resetPostgres()),
    ...resetLocalFallback(),
    ...resetArtifacts(),
  ];

  for (const message of messages) {
    console.log(message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
