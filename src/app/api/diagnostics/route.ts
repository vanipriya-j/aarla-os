import { NextResponse } from "next/server";
import { getDiagnosticsReport } from "@/lib/application/system-diagnostics";
import { assertSetupSecret } from "@/lib/infra/db/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Integration diagnostics for founders/ops.
 *
 * GET /api/diagnostics
 * GET /api/diagnostics?probe=shopify  (requires SETUP_SECRET header or ?secret=)
 *
 * Never returns tokens or full customer PII.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const probeShopify = url.searchParams.get("probe") === "shopify";

  if (probeShopify) {
    try {
      assertSetupSecret(
        url.searchParams.get("secret") ?? request.headers.get("x-setup-secret"),
      );
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Unauthorized",
        },
        { status: 401 },
      );
    }
  }

  try {
    const report = await getDiagnosticsReport({ probeShopify });
    return NextResponse.json(report, { status: report.ok ? 200 : 503 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
