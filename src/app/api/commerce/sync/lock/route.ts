import { NextResponse } from "next/server";
import {
  forceClearCommerceSyncLock,
  getCommerceSyncLockStatus,
  releaseCommerceSyncLock,
} from "@/lib/application/commerce-sync-lock";
import {
  saveShopifyAbandonedResumeCursor,
  saveShopifyOrdersResumeCursor,
  clearShopifyAbandonedWatermark,
  clearShopifyOrdersWatermark,
} from "@/lib/application/commerce-sync-watermarks";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** GET /api/commerce/sync/lock — current lock status */
export async function GET() {
  try {
    const data = await getCommerceSyncLockStatus();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: 500 },
    );
  }
}

/**
 * POST /api/commerce/sync/lock
 * Body: { action: "clear" } | { action: "release", lockToken: string }
 *
 * "clear" also resets Shopify resume cursors + tip watermarks so Full re-sync
 * starts from the newest page again (recovery after a bad mid-page skip).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      lockToken?: string;
    };

    if (body.action === "clear") {
      await forceClearCommerceSyncLock();
      // Reset sync progress so the next Full re-sync does not skip unsaved orders.
      await saveShopifyOrdersResumeCursor(null);
      await saveShopifyAbandonedResumeCursor(null);
      await clearShopifyOrdersWatermark();
      await clearShopifyAbandonedWatermark();
      return NextResponse.json({ ok: true, data: { cleared: true as const } });
    }

    if (body.action === "release") {
      await releaseCommerceSyncLock(body.lockToken ?? "");
      return NextResponse.json({ ok: true, data: { released: true as const } });
    }

    return NextResponse.json(
      { ok: false, error: 'Expected action "clear" or "release".' },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: 500 },
    );
  }
}
