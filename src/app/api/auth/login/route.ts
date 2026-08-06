import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authenticateCredentials,
  isAuthEnabled,
} from "@/lib/auth/credentials";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session-cookie";
import { createAuthSession, sessionTtlSeconds } from "@/lib/auth/sessions";
import { homePathForRole } from "@/lib/auth/roles";

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json(
      { error: "Auth is not configured" },
      { status: 400 },
    );
  }

  let body: { username?: unknown; password?: unknown; next?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 },
    );
  }

  const user = authenticateCredentials(username, password);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { token, session } = await createAuthSession({
      username: user.username,
      role: user.role,
      userAgent: request.headers.get("user-agent"),
      ip: clientIp(request),
    });

    const nextRaw = typeof body.next === "string" ? body.next : "";
    const nextPath =
      nextRaw.startsWith("/") && !nextRaw.startsWith("//")
        ? nextRaw
        : homePathForRole(user.role);

    const res = NextResponse.json({
      ok: true,
      role: session.role,
      username: session.username,
      redirectTo: nextPath,
    });
    res.cookies.set(
      SESSION_COOKIE_NAME,
      token,
      sessionCookieOptions(sessionTtlSeconds()),
    );
    return res;
  } catch (err) {
    console.error("[auth] login failed", err);
    return NextResponse.json(
      { error: "Could not create session — is the database migrated?" },
      { status: 503 },
    );
  }
}
