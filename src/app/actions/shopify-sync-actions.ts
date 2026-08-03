"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import {
  getShopifyCommerceDiagnostics,
  syncShopifyCustomerCallData,
} from "@/lib/application/shopify-sync-service";
import {
  acquireOrRenewCommerceSyncLock,
} from "@/lib/application/commerce-sync-lock";
import type {
  CommerceDiagnosticsPage,
  ShopifySyncSummary,
} from "@/lib/domain/external-commerce-types";

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

/** Sync one Shopify chunk (pass cursor to continue). Requires lockToken. */
export async function syncShopifyCustomerCallDataAction(
  cursor?: string | null,
  lockToken?: string,
): Promise<ActionResult<ShopifySyncSummary>> {
  return wrap(async () => {
    if (!lockToken?.trim()) {
      throw new Error("Sync lock token is required.");
    }
    const lock = await acquireOrRenewCommerceSyncLock(lockToken, "shopify");
    if (!lock.ok) throw new Error(lock.error);
    return syncShopifyCustomerCallData({ cursor: cursor ?? null });
  });
}

export async function getShopifyCommerceDiagnosticsAction(
  page = 1,
  pageSize = 50,
): Promise<ActionResult<CommerceDiagnosticsPage>> {
  return wrap(() => getShopifyCommerceDiagnostics({ page, pageSize }));
}
