import { NextResponse } from "next/server";
import { syncDelhiveryShipments } from "@/lib/application/delhivery-sync-service";
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
 * POST /api/commerce/sync/delhivery
 * Body: { offset?: number | null, lockToken: string }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      offset?: number | null;
      lockToken?: string;
    };
    const lockToken = body.lockToken?.trim();
    if (!lockToken) {
      return NextResponse.json(
        { ok: false, error: "Sync lock token is required." },
        { status: 400 },
      );
    }

    const lock = await acquireOrRenewCommerceSyncLock(lockToken, "delhivery");
    if (!lock.ok) {
      return NextResponse.json({ ok: false, error: lock.error }, { status: 409 });
    }

    const data = await syncDelhiveryShipments({
      // null/undefined → load saved resume offset; number → continue client loop
      offset: body.offset === undefined ? null : body.offset,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: 500 },
    );
  }
}
