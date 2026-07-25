/**
 * Apply all SQL files in supabase/migrations/ in sorted order.
 *
 * Usage: npx tsx scripts/db-migrate.ts
 * Env:   DATABASE_URL or SUPABASE_DB_URL
 */
import { Client } from "pg";
import { shouldUseSsl } from "../src/lib/infra/db/env";
import { runMigrations } from "../src/lib/infra/db/migrate";

function connectionString(): string {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
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
    const result = await runMigrations(client);
    console.log(
      `[db-migrate] done — applied ${result.applied.length}, skipped ${result.skipped.length}`,
    );
    for (const f of result.applied) console.log(`[db-migrate] applied: ${f}`);
    for (const f of result.skipped) console.log(`[db-migrate] skip: ${f}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[db-migrate] FAILED:", err);
  process.exit(1);
});
