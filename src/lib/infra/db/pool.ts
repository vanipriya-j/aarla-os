import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { ConfigurationError, DatabaseUnavailableError } from "./errors";
import { defaultPoolMax, resolveDatabaseUrl, shouldUseSsl } from "./env";

let pool: Pool | null = null;

/**
 * Opt Next.js App Router out of prerendering before DB I/O.
 * Safe no-op outside a Next request (scripts, Vitest).
 */
async function awaitRequestTime(): Promise<void> {
  try {
    const mod = await import("next/server");
    if (typeof mod.connection === "function") {
      await mod.connection();
    }
  } catch {
    /* not in a Next request context */
  }
}

function enrichDbError(message: string): string {
  if (/EMAXCONNSESSION|max clients reached in session mode/i.test(message)) {
    return (
      `${message}. ` +
      `Supabase Session pooler is full (limit ~15). Wait 1–2 minutes for connections to drain, ` +
      `then redeploy. The app now uses Transaction pooler (port 6543) on Vercel automatically — ` +
      `see docs/supabase-vercel.md.`
    );
  }
  return message;
}

export function getDatabaseUrl(): string {
  return resolveDatabaseUrl();
}

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = getDatabaseUrl();
  const useSsl = shouldUseSsl(connectionString);
  const onVercel = process.env.VERCEL === "1";

  pool = new Pool({
    connectionString,
    // Serverless: one client per instance. Session mode dies if each instance opens many.
    max: defaultPoolMax(),
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: onVercel ? 1_000 : 30_000,
    allowExitOnIdle: onVercel,
    // Supabase Cloud and Vercel require TLS. Local Docker does not.
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  pool.on("error", (err) => {
    console.error("[db] unexpected pool error", err);
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  await awaitRequestTime();
  try {
    const result = await getPool().query<T>(text, params);
    return result.rows;
  } catch (err) {
    if (err instanceof ConfigurationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new DatabaseUnavailableError(
      `Database query failed: ${enrichDbError(message)}`,
    );
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await awaitRequestTime();
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DatabaseUnavailableError(
      `Cannot connect to database: ${enrichDbError(message)}. ` +
        `If this is Vercel, set DATABASE_URL to your Supabase pooler connection string (see docs/supabase-vercel.md).`,
    );
  }
  try {
    await client.query("begin");
    const value = await fn(client);
    await client.query("commit");
    return value;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    if (err instanceof ConfigurationError || err instanceof DatabaseUnavailableError) throw err;
    throw err;
  } finally {
    client.release();
  }
}

export async function assertDatabaseAvailable(): Promise<void> {
  await query("select 1 as ok");
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
