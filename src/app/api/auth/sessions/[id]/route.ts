import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { AUTH_ROLE_HEADER } from "@/lib/auth/roles";
import { isAuthEnabled } from "@/lib/auth/credentials";
import { revokeAuthSession } from "@/lib/auth/sessions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 400 });
  }

  const h = await headers();
  if (h.get(AUTH_ROLE_HEADER) !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  try {
    const revoked = await revokeAuthSession(id);
    if (!revoked) {
      return NextResponse.json(
        { error: "Session not found or already revoked" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, revokedId: id });
  } catch (err) {
    console.error("[auth] revoke session failed", err);
    return NextResponse.json(
      { error: "Could not revoke session" },
      { status: 503 },
    );
  }
}
