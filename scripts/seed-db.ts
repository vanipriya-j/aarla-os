/**
 * Seed Postgres with Aarla OS demo data (local or Supabase Cloud).
 *
 * Usage: npx tsx scripts/seed-db.ts
 * Env:   DATABASE_URL or SUPABASE_DB_URL
 */
import { Client } from "pg";
import { shouldUseSsl } from "../src/lib/infra/db/env";
import { runSeedDemo } from "../src/lib/infra/db/seed-demo";

const DATABASE_URL =
  process.env.DATABASE_URL?.trim() ||
  process.env.SUPABASE_DB_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  });
  console.log(
    `[seed-db] connecting to ${DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}`,
  );
  await client.connect();

  try {
    await client.query("begin");
    try {
      await runSeedDemo(client);
      await client.query("commit");
      console.log("[seed-db] seed complete");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[seed-db] FAILED:", err);
  process.exit(1);
});
