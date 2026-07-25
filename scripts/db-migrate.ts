/**
 * Apply all SQL files in supabase/migrations/ in sorted order.
 * Works against local Docker / Supabase Local or Supabase Cloud.
 *
 * Usage: npx tsx scripts/db-migrate.ts
 * Env:   DATABASE_URL or SUPABASE_DB_URL
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { shouldUseSsl } from "../src/lib/infra/db/env";

function connectionString(): string {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../supabase/migrations");

async function ensureMigrationsTable(client: Client) {
  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function appliedSet(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ filename: string }>(
    `select filename from schema_migrations order by filename`,
  );
  return new Set(rows.map((r) => r.filename));
}

async function tableExists(client: Client, name: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `select to_regclass($1) is not null as exists`,
    [`public.${name}`],
  );
  return Boolean(rows[0]?.exists);
}

async function markApplied(client: Client, filename: string) {
  await client.query(
    `insert into schema_migrations (filename) values ($1) on conflict do nothing`,
    [filename],
  );
}

async function main() {
  const url = connectionString();
  const client = new Client({
    connectionString: url,
    ssl: shouldUseSsl(url) ? { rejectUnauthorized: false } : undefined,
  });
  console.log(`[db-migrate] connecting to ${url.replace(/:[^:@/]+@/, ":***@")}`);
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await appliedSet(client);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.log("[db-migrate] no .sql files found");
      return;
    }

    // Bootstrap tracking when schema was applied outside this tool (e.g. supabase start).
    const INIT = "20260725140000_init_aarla_os.sql";
    if (!applied.has(INIT) && files.includes(INIT) && (await tableExists(client, "organizations"))) {
      console.log(`[db-migrate] bootstrap: ${INIT} already present — recording as applied`);
      await markApplied(client, INIT);
      applied.add(INIT);
    }

    let ran = 0;
    for (const filename of files) {
      if (applied.has(filename)) {
        console.log(`[db-migrate] skip (already applied): ${filename}`);
        continue;
      }

      const fullPath = path.join(MIGRATIONS_DIR, filename);
      const sql = await readFile(fullPath, "utf8");
      console.log(`[db-migrate] applying: ${filename}`);

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(`insert into schema_migrations (filename) values ($1)`, [
          filename,
        ]);
        await client.query("commit");
        ran += 1;
        console.log(`[db-migrate] ok: ${filename}`);
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }

    console.log(`[db-migrate] done — applied ${ran}, skipped ${files.length - ran}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[db-migrate] FAILED:", err);
  process.exit(1);
});
