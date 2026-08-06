import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthEnabled } from "@/lib/auth/credentials";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { resolveAuthSession } from "@/lib/auth/sessions";
import {
  AUTH_ROLE_HEADER,
  AUTH_SESSION_HEADER,
  AUTH_USER_HEADER,
  canAccessPath,
  homePathForRole,
  isPublicPath,
  isStaticAssetPath,
} from "@/lib/auth/roles";

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next && next !== "/login") {
    url.searchParams.set("next", next);
  } else {
    url.search = "";
  }
  return NextResponse.redirect(url);
}

function unauthorizedApi(): NextResponse {
  return NextResponse.json(
    { error: "Authentication required" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

function withAuthHeaders(
  request: NextRequest,
  input: { role: string; username: string; sessionId?: string | null },
): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(AUTH_ROLE_HEADER, input.role);
  headers.set(AUTH_USER_HEADER, input.username);
  if (input.sessionId) {
    headers.set(AUTH_SESSION_HEADER, input.sessionId);
  } else {
    headers.delete(AUTH_SESSION_HEADER);
  }
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAssetPath(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthEnabled()) {
    return withAuthHeaders(request, { role: "admin", username: "local" });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let session = null;
  try {
    session = await resolveAuthSession(token);
  } catch (err) {
    console.error("[auth] session lookup failed", err);
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Auth session store unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return redirectToLogin(request);
  }

  if (!session) {
    return isApiPath(pathname) ? unauthorizedApi() : redirectToLogin(request);
  }

  if (!canAccessPath(session.role, pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = homePathForRole(session.role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  return withAuthHeaders(request, {
    role: session.role,
    username: session.username,
    sessionId: session.id,
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
