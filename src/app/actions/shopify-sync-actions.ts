"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import {
  getShopifyCommerceDiagnostics,
  syncShopifyCustomerCallData,
} from "@/lib/application/shopify-sync-service";
import type {
  CommerceCustomerDiagnostic,
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

/** Sync one Shopify chunk (pass cursor to continue). */
export async function syncShopifyCustomerCallDataAction(
  cursor?: string | null,
): Promise<ActionResult<ShopifySyncSummary>> {
  return wrap(() => syncShopifyCustomerCallData({ cursor: cursor ?? null }));
}

export async function getShopifyCommerceDiagnosticsAction(): Promise<
  ActionResult<CommerceCustomerDiagnostic[]>
> {
  return wrap(() => getShopifyCommerceDiagnostics());
}
