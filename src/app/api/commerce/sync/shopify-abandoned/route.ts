import { NextResponse } from "next/server";
import { syncShopifyAbandonedCheckouts } from "@/lib/application/abandoned-checkout-sync-service";
import { acquireOrRenewCommerceSyncLock } from "@/lib/application/commerce-sync-lock";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One abandoned-checkout page per call — keep under Vercel limits. */
export const maxDuration = 60;

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * POST /api/commerce/sync/shopify-abandoned
 * Body: { cursor?: string | null, lockToken: string, mode?: "incremental" | "full" }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      cursor?: string | null;
      lockToken?: string;
      mode?: "incremental" | "full";
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

    const data = await syncShopifyAbandonedCheckouts({
      cursor: body.cursor ?? null,
      mode: body.mode === "full" ? "full" : "incremental",
      runId: lockToken,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: 500 },
    );
  }
}
