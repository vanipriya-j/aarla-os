"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as svc from "@/lib/application/commerce-cart-service";
import type { CartDashboardFilters } from "@/lib/domain/commerce-cart-types";

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

export async function listCartDashboardAction(filters: CartDashboardFilters = {}) {
  return wrap(() => svc.listCartDashboard(filters));
}

export async function refreshCartSessionStatusesAction() {
  return wrap(() => svc.refreshCartSessionStatuses());
}

export async function markCartSessionRecoveredAction(
  sessionId: string,
  opts: { orderExternalId?: string | null; revenue?: number | null; notes?: string | null } = {},
) {
  return wrap(() => svc.markCartSessionRecovered(sessionId, opts));
}

export async function enqueueIdentifiedAbandonedCartsAction() {
  return wrap(() => svc.enqueueIdentifiedAbandonedCarts());
}

export async function getCampaignFunnelAction(
  campaignId: string,
  startIso: string,
  endIso: string,
) {
  return wrap(() => svc.getCampaignFunnel(campaignId, startIso, endIso));
}
