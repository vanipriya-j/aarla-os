import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  AUTH_ROLE_HEADER,
  AUTH_SESSION_HEADER,
} from "@/lib/auth/roles";
import { isAuthEnabled } from "@/lib/auth/credentials";
import { listActiveAuthSessions } from "@/lib/auth/sessions";

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ sessions: [], currentSessionId: null });
  }

  const h = await headers();
  if (h.get(AUTH_ROLE_HEADER) !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const sessions = await listActiveAuthSessions();
    return NextResponse.json({
      sessions,
      currentSessionId: h.get(AUTH_SESSION_HEADER),
    });
  } catch (err) {
    console.error("[auth] list sessions failed", err);
    return NextResponse.json(
      { error: "Could not list sessions" },
      { status: 503 },
    );
  }
}
