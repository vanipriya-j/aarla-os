/** HttpOnly session cookie for Aarla OS login. */
export const SESSION_COOKIE_NAME = "aarla_session";

export function sessionCookieOptions(maxAgeSeconds: number) {
  const secure =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function clearSessionCookieOptions() {
  return {
    ...sessionCookieOptions(0),
    maxAge: 0,
  };
}
