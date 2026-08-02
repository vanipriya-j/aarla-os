"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import {
  forceClearCommerceSyncLock,
  getCommerceSyncLockStatus,
  releaseCommerceSyncLock,
  type CommerceSyncLockStatus,
} from "@/lib/application/commerce-sync-lock";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

export async function getCommerceSyncLockStatusAction(): Promise<
  ActionResult<CommerceSyncLockStatus>
> {
  return wrap(() => getCommerceSyncLockStatus());
}

export async function releaseCommerceSyncLockAction(
  lockToken: string,
): Promise<ActionResult<{ released: true }>> {
  return wrap(async () => {
    await releaseCommerceSyncLock(lockToken);
    return { released: true as const };
  });
}

export async function forceClearCommerceSyncLockAction(): Promise<
  ActionResult<{ cleared: true }>
> {
  return wrap(async () => {
    await forceClearCommerceSyncLock();
    return { cleared: true as const };
  });
}
