import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { ConfigurationError, DatabaseUnavailableError } from "./errors";

let pool: Pool | null = null;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new ConfigurationError(
      "DATABASE_URL is not set. Copy .env.example to .env.local and start the local database.",
    );
  }
  return url;
}

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 10,
    connectionTimeoutMillis: 5000,
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
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DatabaseUnavailableError(`Cannot connect to database: ${message}`);
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
