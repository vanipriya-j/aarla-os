import { NextResponse } from "next/server";
import { getHealthReport } from "@/lib/application/system-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness/readiness — no secrets, safe for uptime checks. */
export async function GET() {
  const report = await getHealthReport();
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
