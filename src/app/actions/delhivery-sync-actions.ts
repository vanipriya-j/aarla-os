"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import {
  getDelhiveryShipmentDiagnostics,
  syncDelhiveryShipments,
} from "@/lib/application/delhivery-sync-service";
import type {
  DelhiverySyncSummary,
  ShipmentDiagnosticRow,
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

export async function syncDelhiveryShipmentsAction(): Promise<
  ActionResult<DelhiverySyncSummary>
> {
  return wrap(() => syncDelhiveryShipments());
}

export async function getDelhiveryShipmentDiagnosticsAction(): Promise<
  ActionResult<ShipmentDiagnosticRow[]>
> {
  return wrap(() => getDelhiveryShipmentDiagnostics());
}
