import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query } from "@/lib/infra/db/pool";
import {
  acquireOrRenewCommerceSyncLock,
  getCommerceSyncLockStatus,
  releaseCommerceSyncLock,
} from "@/lib/application/commerce-sync-lock";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("commerce sync lock", () => {
  beforeAll(async () => {
    const tables = await query<{ exists: boolean }>(
      `select to_regclass('public.commerce_sync_locks') is not null as exists`,
    );
    if (!tables[0]?.exists) {
      throw new Error("commerce_sync_locks missing — run db:migrate");
    }
    await query(`delete from commerce_sync_locks`);
  });

  afterAll(async () => {
    await query(`delete from commerce_sync_locks`);
    await closePool();
  });

  it("acquires, rejects a second holder, renews the same token, then releases", async () => {
    await query(`delete from commerce_sync_locks`);

    const first = await acquireOrRenewCommerceSyncLock("token-a", "shopify");
    expect(first).toEqual({ ok: true });

    const status = await getCommerceSyncLockStatus();
    expect(status.locked).toBe(true);
    expect(status.channel).toBe("shopify");

    const blocked = await acquireOrRenewCommerceSyncLock("token-b", "delhivery");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toMatch(/already in progress/i);
    }

    const renew = await acquireOrRenewCommerceSyncLock("token-a", "delhivery");
    expect(renew).toEqual({ ok: true });
    expect((await getCommerceSyncLockStatus()).channel).toBe("delhivery");

    await releaseCommerceSyncLock("token-a");
    expect((await getCommerceSyncLockStatus()).locked).toBe(false);

    const again = await acquireOrRenewCommerceSyncLock("token-b", "shopify");
    expect(again).toEqual({ ok: true });
    await releaseCommerceSyncLock("token-b");
  });
});
