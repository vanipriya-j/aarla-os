import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/request-auth";
import { AttendanceService } from "@/lib/application/team-service";

/**
 * Authenticated attendance evidence bytes — never public.
 * Admin or FOUNDER_ADMIN / attendance.correct roles only.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ evidenceId: string }> },
) {
  const auth = await getRequestAuth();
  const allowed =
    auth.role === "admin" ||
    auth.accessRoleCodes.includes("FOUNDER_ADMIN") ||
    auth.accessRoleCodes.includes("ADMIN");
  if (auth.authEnabled && !allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { evidenceId } = await context.params;
  const file = await AttendanceService.getEvidence(evidenceId);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.content), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
