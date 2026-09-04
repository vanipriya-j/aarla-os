import { NextResponse } from "next/server";
import {
  forceClearCommerceSyncLock,
  getCommerceSyncLockStatus,
  releaseCommerceSyncLock,
} from "@/lib/application/commerce-sync-lock";
import {
  saveShopifyAbandonedResumeCursor,
  saveShopifyOrdersResumeCursor,
  saveDelhiveryResumeOffset,
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
 * Body:
 *   { action: "unlock" }  — clear lock only (auto-resume; keeps cursors)
 *   { action: "clear" }   — clear lock + resume cursors + tip watermarks (manual reset)
 *   { action: "release", lockToken }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      lockToken?: string;
    };

    if (body.action === "unlock") {
      await forceClearCommerceSyncLock();
      return NextResponse.json({ ok: true, data: { unlocked: true as const } });
    }

    if (body.action === "clear") {
      await forceClearCommerceSyncLock();
      // Clear resume cursors so a stuck mid-walk can restart cleanly, but keep
      // committed watermarks — wiping them forced Sync All to re-walk the full
      // order catalog (e.g. 600+ orders) every time. Use mode "full" / Full re-sync
      // when a true history rebuild is needed.
      await saveShopifyOrdersResumeCursor(null);
      await saveShopifyAbandonedResumeCursor(null);
      await saveDelhiveryResumeOffset(null);
      return NextResponse.json({ ok: true, data: { cleared: true as const } });
    }

    if (body.action === "release") {
      await releaseCommerceSyncLock(body.lockToken ?? "");
      return NextResponse.json({ ok: true, data: { released: true as const } });
    }

    return NextResponse.json(
      { ok: false, error: 'Expected action "unlock", "clear", or "release".' },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: 500 },
    );
  }
}
