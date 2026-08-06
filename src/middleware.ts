import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authenticateBasic,
  isAuthEnabled,
  unauthorizedBasicResponse,
} from "@/lib/auth/basic-auth";
import {
  AUTH_ROLE_HEADER,
  AUTH_USER_HEADER,
  canAccessPath,
  homePathForRole,
  isPublicPath,
  isStaticAssetPath,
} from "@/lib/auth/roles";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAssetPath(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthEnabled()) {
    // Dev / unset — open app behaves as admin for nav purposes.
    const headers = new Headers(request.headers);
    headers.set(AUTH_ROLE_HEADER, "admin");
    headers.set(AUTH_USER_HEADER, "local");
    return NextResponse.next({ request: { headers } });
  }

  const user = authenticateBasic(request.headers.get("authorization"));
  if (!user) {
    return unauthorizedBasicResponse();
  }

  if (!canAccessPath(user.role, pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = homePathForRole(user.role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set(AUTH_ROLE_HEADER, user.role);
  headers.set(AUTH_USER_HEADER, user.username);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
