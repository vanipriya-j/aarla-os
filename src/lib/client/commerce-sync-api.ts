import type { ShopifySyncSummary } from "@/lib/domain/external-commerce-types";
import type {
  DelhiverySyncSummary,
} from "@/lib/domain/shipment-types";
import type { CommerceSyncLockStatus } from "@/lib/application/commerce-sync-lock";
import { formatCommerceSyncFailure } from "@/lib/client/commerce-sync-errors";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function postJson<T>(url: string, body: unknown): Promise<ActionResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, error: formatCommerceSyncFailure(err) };
  }

  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      error: formatCommerceSyncFailure(
        new Error(
          res.status === 504 || res.status === 408 || res.status === 502
            ? "timed out"
            : `An unexpected response was received from the server (${res.status}).`,
        ),
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: formatCommerceSyncFailure(
        new Error("An unexpected response was received from the server."),
      ),
    };
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "ok" in parsed &&
    (parsed as { ok: unknown }).ok === true &&
    "data" in parsed
  ) {
    return parsed as ActionResult<T>;
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "ok" in parsed &&
    (parsed as { ok: unknown }).ok === false &&
    "error" in parsed
  ) {
    return {
      ok: false,
      error: String((parsed as { error: unknown }).error ?? "Sync failed"),
    };
  }

  return {
    ok: false,
    error: formatCommerceSyncFailure(
      new Error(`An unexpected response was received from the server (${res.status}).`),
    ),
  };
}

export async function syncShopifyChunkViaApi(
  cursor: string | null,
  lockToken: string,
  mode: "incremental" | "full" = "incremental",
): Promise<ActionResult<ShopifySyncSummary>> {
  return postJson<ShopifySyncSummary>("/api/commerce/sync/shopify", {
    cursor,
    lockToken,
    mode,
  });
}

export async function syncDelhiveryChunkViaApi(
  offset: number | null,
  lockToken: string,
): Promise<ActionResult<DelhiverySyncSummary>> {
  return postJson<DelhiverySyncSummary>("/api/commerce/sync/delhivery", {
    offset,
    lockToken,
  });
}

export async function clearCommerceSyncLockViaApi(): Promise<
  ActionResult<{ cleared: true }>
> {
  return postJson<{ cleared: true }>("/api/commerce/sync/lock", {
    action: "clear",
  });
}

export async function getCommerceSyncLockViaApi(): Promise<
  ActionResult<CommerceSyncLockStatus>
> {
  try {
    const res = await fetch("/api/commerce/sync/lock", {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body = (await res.json()) as ActionResult<CommerceSyncLockStatus>;
    return body;
  } catch (err) {
    return { ok: false, error: formatCommerceSyncFailure(err) };
  }
}
