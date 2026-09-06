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
import { AccountService } from "@/lib/application/team-service";
import { primaryAccessRole } from "@/lib/auth/team-access";

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
      { status: 401 },
    );
  }

  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent");

  // 1) Env founder/CRM shared logins (unchanged)
  const envUser = authenticateCredentials(username, password);
  if (envUser) {
    try {
      await AccountService.recordLoginEvent({
        username: envUser.username,
        outcome: "success",
        role: envUser.role,
        ip,
        userAgent,
      });
      const { token, session } = await createAuthSession({
        username: envUser.username,
        role: envUser.role,
        userAgent,
        ip,
      });

      const nextRaw = typeof body.next === "string" ? body.next : "";
      const nextPath =
        nextRaw.startsWith("/") && !nextRaw.startsWith("//")
          ? nextRaw
          : homePathForRole(envUser.role);

      const res = NextResponse.json({
        ok: true,
        role: session.role,
        username: session.username,
        redirectTo: nextPath,
        mustChangeCredential: false,
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

  // 2) Internal team accounts (username + PIN/password, no email)
  try {
    const result = await AccountService.authenticateInternal(username, password);
    if (!result.ok) {
      await AccountService.recordLoginEvent({
        username,
        outcome: result.reason === "disabled" ? "disabled" : "failure",
        accountId: "account" in result ? result.account?.id : null,
        ip,
        userAgent,
      });
      return NextResponse.json(
        {
          error:
            result.reason === "disabled"
              ? "This account is disabled"
              : "Invalid username or password",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const account = result.account;
    await AccountService.touchLogin(account.id);
    await AccountService.recordLoginEvent({
      username: account.username,
      outcome: "success",
      role: "team",
      accountId: account.id,
      ip,
      userAgent,
    });

    const { token, session } = await createAuthSession({
      username: account.username,
      role: "team",
      accountId: account.id,
      personId: account.personId,
      accessRoleCodes: account.accessRoleCodes,
      userAgent,
      ip,
    });

    let redirectTo: string;
    if (account.mustChangeCredential) {
      redirectTo = "/account/change-pin";
    } else if (account.attendanceRequired) {
      redirectTo = "/attendance/check-in";
    } else {
      const nextRaw = typeof body.next === "string" ? body.next : "";
      redirectTo =
        nextRaw.startsWith("/") && !nextRaw.startsWith("//")
          ? nextRaw
          : homePathForRole("team", account.accessRoleCodes);
    }

    void primaryAccessRole(account.accessRoleCodes);

    const res = NextResponse.json({
      ok: true,
      role: session.role,
      username: session.username,
      redirectTo,
      mustChangeCredential: account.mustChangeCredential,
      displayName: account.displayName,
    });
    res.cookies.set(
      SESSION_COOKIE_NAME,
      token,
      sessionCookieOptions(sessionTtlSeconds()),
    );
    return res;
  } catch (err) {
    console.error("[auth] team login failed", err);
    // If team tables aren't migrated yet, fall through as invalid
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
