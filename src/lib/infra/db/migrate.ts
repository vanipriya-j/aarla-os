/**
 * Apply SQL migrations (local CLI or Vercel /api/setup).
 * Prefers files under supabase/migrations/; falls back to bundled SQL for serverless.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { BUNDLED_MIGRATIONS } from "./bundled-migrations";

type DbClient = Pick<PoolClient, "query">;

const INIT = "20260725140000_init_aarla_os.sql";

/**
 * Non-idempotent migrations: if the primary table already exists, record the
 * migration as applied instead of re-running CREATE. Idempotent migrations
 * (locks / watermarks / source_key) should run so IF NOT EXISTS can fill gaps.
 */
const PREEXISTING_TABLE_MARKERS: Record<string, string> = {
  [INIT]: "organizations",
  "20260801120000_aarla_universe.sql": "creative_nodes",
  "20260802120000_customer_calls.sql": "customer_call_segments",
  "20260803120000_external_commerce.sql": "external_customers",
  "20260804120000_shipments.sql": "shipments",
};

export type MigrateResult = {
  applied: string[];
  skipped: string[];
};

type MigrationFile = { filename: string; sql: string };

async function loadMigrations(): Promise<MigrationFile[]> {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  try {
    const names = (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));
    if (names.length === 0) return BUNDLED_MIGRATIONS;
    const files: MigrationFile[] = [];
    for (const filename of names) {
      files.push({
        filename,
        sql: await readFile(path.join(dir, filename), "utf8"),
      });
    }
    return files;
  } catch {
    return BUNDLED_MIGRATIONS;
  }
}

async function ensureMigrationsTable(client: DbClient) {
  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function appliedSet(client: DbClient): Promise<Set<string>> {
  const { rows } = await client.query<{ filename: string }>(
    `select filename from schema_migrations order by filename`,
  );
  return new Set(rows.map((r) => r.filename));
}

async function tableExists(client: DbClient, name: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `select to_regclass($1) is not null as exists`,
    [`public.${name}`],
  );
  return Boolean(rows[0]?.exists);
}

async function markApplied(client: DbClient, filename: string) {
  await client.query(
    `insert into schema_migrations (filename) values ($1) on conflict do nothing`,
    [filename],
  );
}

function isAlreadyExistsError(err: unknown): boolean {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  // 42P07 duplicate_table, 42710 duplicate_object, 42701 duplicate_column
  if (code === "42P07" || code === "42710" || code === "42701") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /already exists/i.test(message);
}

export async function runMigrations(client: DbClient): Promise<MigrateResult> {
  await ensureMigrationsTable(client);
  const applied = await appliedSet(client);
  const files = await loadMigrations();

  for (const [filename, table] of Object.entries(PREEXISTING_TABLE_MARKERS)) {
    if (!applied.has(filename) && files.some((f) => f.filename === filename)) {
      if (await tableExists(client, table)) {
        await markApplied(client, filename);
        applied.add(filename);
      }
    }
  }

  const appliedNow: string[] = [];
  const skipped: string[] = [];

  for (const { filename, sql } of files) {
    if (applied.has(filename)) {
      skipped.push(filename);
      continue;
    }

    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(`insert into schema_migrations (filename) values ($1)`, [
        filename,
      ]);
      await client.query("commit");
      appliedNow.push(filename);
    } catch (err) {
      await client.query("rollback");
      if (isAlreadyExistsError(err)) {
        // Runtime ensure* / partial apply left objects without a schema_migrations row.
        await markApplied(client, filename);
        applied.add(filename);
        skipped.push(filename);
        continue;
      }
      throw err;
    }
  }

  return { applied: appliedNow, skipped };
}
