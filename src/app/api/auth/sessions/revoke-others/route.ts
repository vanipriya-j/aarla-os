import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  AUTH_ROLE_HEADER,
  AUTH_SESSION_HEADER,
} from "@/lib/auth/roles";
import { isAuthEnabled } from "@/lib/auth/credentials";
import { revokeOtherAuthSessions } from "@/lib/auth/sessions";

export async function POST() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 400 });
  }

  const h = await headers();
  if (h.get(AUTH_ROLE_HEADER) !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const currentSessionId = h.get(AUTH_SESSION_HEADER);
  if (!currentSessionId) {
    return NextResponse.json(
      { error: "Current session missing" },
      { status: 400 },
    );
  }

  try {
    const revokedCount = await revokeOtherAuthSessions(currentSessionId);
    return NextResponse.json({ ok: true, revokedCount });
  } catch (err) {
    console.error("[auth] revoke-others failed", err);
    return NextResponse.json(
      { error: "Could not revoke other sessions" },
      { status: 503 },
    );
  }
}
