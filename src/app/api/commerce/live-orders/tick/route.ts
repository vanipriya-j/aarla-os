import { NextResponse } from "next/server";
import { runLiveOrdersTick } from "@/lib/application/live-orders-service";
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
 * POST /api/commerce/live-orders/tick
 * Body: { lockToken: string }
 *
 * Quiet incremental Shopify order pull + fulfil ingest for the live ops desk.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { lockToken?: string; maxChunks?: number };
    const lockToken = body.lockToken?.trim();
    if (!lockToken) {
      return NextResponse.json(
        { ok: false, error: "Sync lock token is required." },
        { status: 400 },
      );
    }
    const data = await runLiveOrdersTick({
      lockToken,
      maxChunks: body.maxChunks,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: 500 },
    );
  }
}
