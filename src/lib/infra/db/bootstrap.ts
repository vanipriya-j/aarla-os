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
    connectionTimeoutMillis: 20_000,
  });

  try {
    await client.connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const looksLikeTimeout = /timeout|ETIMEDOUT|ENETUNREACH|ECONNREFUSED/i.test(
      message,
    );
    if (looksLikeTimeout) {
      throw new Error(
        `Cannot reach Postgres (${message}). On Vercel, use Supabase’s Session pooler URI — not the direct db.*.supabase.co host. In Supabase: Project Settings → Database → Connection string → Method: Session pooler → URI. Put that in Vercel DATABASE_URL, Redeploy, try again.`,
      );
    }
    throw err;
  }

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
      "SETUP_SECRET is not set on this deployment. In Vercel → Settings → Environment Variables, add SETUP_SECRET for Preview (and Production), then Redeploy this deployment.",
    );
  }
  const got = provided?.trim() ?? "";
  if (!got) {
    throw new Error("Enter the setup secret (same value as SETUP_SECRET in Vercel).");
  }
  if (got !== expected) {
    throw new Error(
      "Setup secret does not match Vercel SETUP_SECRET. Use the exact value (no quotes), for the Preview environment if you are on a preview URL, then Redeploy after changing it.",
    );
  }
}
