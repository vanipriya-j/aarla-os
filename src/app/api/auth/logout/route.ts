import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookieOptions,
} from "@/lib/auth/session-cookie";
import { revokeAuthSessionByToken } from "@/lib/auth/sessions";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  try {
    await revokeAuthSessionByToken(token);
  } catch (err) {
    console.error("[auth] logout revoke failed", err);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", clearSessionCookieOptions());
  return res;
}
