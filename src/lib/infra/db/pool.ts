import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { ConfigurationError, DatabaseUnavailableError } from "./errors";
import { resolveDatabaseUrl, shouldUseSsl } from "./env";

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

export function getDatabaseUrl(): string {
  return resolveDatabaseUrl();
}

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = getDatabaseUrl();
  const useSsl = shouldUseSsl(connectionString);

  pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    connectionTimeoutMillis: 8_000,
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
    throw new DatabaseUnavailableError(`Database query failed: ${message}`);
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
      `Cannot connect to database: ${message}. ` +
        `If this is Vercel, set DATABASE_URL to your Supabase connection string (see docs/supabase-vercel.md).`,
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
