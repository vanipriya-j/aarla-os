/**
 * Minimal tenant rows required after migrations-only /setup (seed unchecked).
 * Does NOT load demo products, queues, or truncate anything.
 */
import type { PoolClient } from "pg";
import { getPool } from "./pool";
import { ORG_CODE, ORG_ID } from "./ids";
import { ensureCustomerCallSegments } from "./seed-customer-calls";

type DbClient = Pick<PoolClient, "query">;

/** Idempotent: Aarla org row so FK writes (commerce, calls, inventory) succeed. */
export async function ensureOrganization(
  client: DbClient,
  options?: { isDemo?: boolean },
): Promise<void> {
  const isDemo = options?.isDemo === true;
  await client.query(
    `insert into organizations (id, code, name, is_demo)
     values ($1, $2, $3, $4)
     on conflict (code) do nothing`,
    [ORG_ID, ORG_CODE, "Aarla", isDemo],
  );
}

/**
 * Org + Customer Calls segment definitions (no demo queue rows).
 * Safe to run on every /setup and at runtime for self-heal.
 */
export async function ensureTenantBasics(
  client: DbClient,
  options?: { isDemo?: boolean },
): Promise<void> {
  await ensureOrganization(client, options);
  await ensureCustomerCallSegments(client);
}

let tenantEnsureInFlight: Promise<void> | null = null;

/** Runtime self-heal via the shared pool (Customer Calls / commerce ingest). */
export async function ensureTenantBasicsViaPool(): Promise<void> {
  if (!tenantEnsureInFlight) {
    tenantEnsureInFlight = (async () => {
      const client = await getPool().connect();
      try {
        await ensureTenantBasics(client, { isDemo: false });
      } finally {
        client.release();
      }
    })().finally(() => {
      tenantEnsureInFlight = null;
    });
  }
  await tenantEnsureInFlight;
}
