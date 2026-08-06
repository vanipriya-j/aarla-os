import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@/lib/infra/db/pool";
import { runMigrations } from "@/lib/infra/db/migrate";
import { getPool } from "@/lib/infra/db/pool";
import {
  createAuthSession,
  listActiveAuthSessions,
  resolveAuthSession,
  revokeAuthSession,
  revokeOtherAuthSessions,
} from "@/lib/auth/sessions";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("auth_sessions store", () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await runMigrations(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it("creates, resolves, and revokes sessions", async () => {
    const a = await createAuthSession({
      username: "admin",
      role: "admin",
      userAgent: "Vitest/A",
      ip: "127.0.0.1",
    });
    const b = await createAuthSession({
      username: "crm",
      role: "crm",
      userAgent: "Vitest/B",
      ip: "127.0.0.1",
    });

    const resolved = await resolveAuthSession(a.token);
    expect(resolved?.id).toBe(a.session.id);
    expect(resolved?.role).toBe("admin");

    const listed = await listActiveAuthSessions();
    expect(listed.some((s) => s.id === a.session.id)).toBe(true);
    expect(listed.some((s) => s.id === b.session.id)).toBe(true);

    const revokedCount = await revokeOtherAuthSessions(a.session.id);
    expect(revokedCount).toBeGreaterThanOrEqual(1);
    expect(await resolveAuthSession(b.token)).toBeNull();
    expect(await resolveAuthSession(a.token)).not.toBeNull();

    expect(await revokeAuthSession(a.session.id)).toBe(true);
    expect(await resolveAuthSession(a.token)).toBeNull();
  });
});
