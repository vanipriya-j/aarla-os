import { Client } from "pg";
import { resolveDatabaseUrl, shouldUseSsl } from "./env";
import { runMigrations } from "./migrate";
import { runSeedDemo } from "./seed-demo";

export type BootstrapResult = {
  migrated: string[];
  skippedMigrations: string[];
  seeded: boolean;
};

/**
 * One-shot: apply migrations, then (optionally) load demo seed data.
 * Used by POST /api/setup so founders without a local machine can initialize Supabase Cloud.
 */
export async function bootstrapDatabase(options: {
  seed: boolean;
}): Promise<BootstrapResult> {
  const url = resolveDatabaseUrl();
  const client = new Client({
    connectionString: url,
    ssl: shouldUseSsl(url) ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 15_000,
  });

  await client.connect();
  try {
    const migrate = await runMigrations(client);

    if (options.seed) {
      await client.query("begin");
      try {
        await runSeedDemo(client);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }

    return {
      migrated: migrate.applied,
      skippedMigrations: migrate.skipped,
      seeded: options.seed,
    };
  } finally {
    await client.end();
  }
}

export function assertSetupSecret(provided: string | null | undefined): void {
  const expected = process.env.SETUP_SECRET?.trim();
  if (!expected) {
    throw new Error(
      "SETUP_SECRET is not set on the server. Add it in Vercel → Settings → Environment Variables, redeploy, then try again.",
    );
  }
  if (!provided || provided !== expected) {
    throw new Error("Invalid setup secret.");
  }
}
