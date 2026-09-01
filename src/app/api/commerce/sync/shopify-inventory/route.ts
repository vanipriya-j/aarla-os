import { NextResponse } from "next/server";
import {
  compareShopifyInventoryDrift,
  pullShopifyInventoryToAarla,
  pushAarlaInventoryToShopify,
} from "@/lib/application/inventory-sync-service";
import { acquireOrRenewCommerceSyncLock } from "@/lib/application/commerce-sync-lock";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * POST /api/commerce/sync/shopify-inventory
 * action: compare | push | pull
 * Chunked Shopify ↔ Aarla inventory sync.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      cursor?: string | null;
      lockToken?: string;
      action?: "compare" | "push" | "pull";
      driftedOnly?: boolean;
    };
    const lockToken = body.lockToken?.trim();
    if (!lockToken) {
      return NextResponse.json(
        { ok: false, error: "Sync lock token is required." },
        { status: 400 },
      );
    }

    const lock = await acquireOrRenewCommerceSyncLock(lockToken, "shopify");
    if (!lock.ok) {
      return NextResponse.json({ ok: false, error: lock.error }, { status: 409 });
    }

    const action = body.action ?? "compare";
    const deps = {
      cursor: body.cursor ?? null,
      driftedOnly: body.driftedOnly ?? true,
    };

    const data =
      action === "push"
        ? await pushAarlaInventoryToShopify(deps)
        : action === "pull"
          ? await pullShopifyInventoryToAarla(deps)
          : await compareShopifyInventoryDrift(deps);

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: 500 },
    );
  }
}
