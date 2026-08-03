import { NextResponse } from "next/server";
import { syncShopifyCustomerCallData } from "@/lib/application/shopify-sync-service";
import { acquireOrRenewCommerceSyncLock } from "@/lib/application/commerce-sync-lock";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One Shopify page per call — keep under Vercel limits. */
export const maxDuration = 60;

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * POST /api/commerce/sync/shopify
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

    const data = await syncShopifyCustomerCallData({
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
