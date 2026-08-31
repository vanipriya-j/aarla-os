"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import {
  getDelhiveryShipmentDiagnostics,
  syncDelhiveryShipments,
} from "@/lib/application/delhivery-sync-service";
import {
  acquireOrRenewCommerceSyncLock,
} from "@/lib/application/commerce-sync-lock";
import type {
  DelhiverySyncSummary,
  ShipmentDiagnosticsPage,
  ShipmentDiagnosticSort,
} from "@/lib/domain/shipment-types";
import {
  SHIPMENT_DIAGNOSTIC_SORTS,
} from "@/lib/domain/shipment-types";

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

/** Sync one Delhivery AWB chunk (pass offset to continue). Requires lockToken. */
export async function syncDelhiveryShipmentsAction(
  offset?: number | null,
  lockToken?: string,
): Promise<ActionResult<DelhiverySyncSummary>> {
  return wrap(async () => {
    if (!lockToken?.trim()) {
      throw new Error("Sync lock token is required.");
    }
    const lock = await acquireOrRenewCommerceSyncLock(lockToken, "delhivery");
    if (!lock.ok) throw new Error(lock.error);
    return syncDelhiveryShipments({ offset: offset ?? null });
  });
}

export async function getDelhiveryShipmentDiagnosticsAction(
  page = 1,
  pageSize = 50,
  sort: ShipmentDiagnosticSort = "last-synced",
): Promise<ActionResult<ShipmentDiagnosticsPage>> {
  const safeSort = SHIPMENT_DIAGNOSTIC_SORTS.includes(sort) ? sort : "last-synced";
  return wrap(() =>
    getDelhiveryShipmentDiagnostics({ page, pageSize, sort: safeSort }),
  );
}
