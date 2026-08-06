import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isAuthEnabled } from "@/lib/auth/credentials";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { resolveAuthSession } from "@/lib/auth/sessions";
import { homePathForRole } from "@/lib/auth/roles";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "Sign in — Aarla OS",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isAuthEnabled()) {
    redirect("/");
  }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  try {
    const session = await resolveAuthSession(token);
    if (session) {
      redirect(homePathForRole(session.role));
    }
  } catch {
    /* show login if session store is down */
  }

  const params = await searchParams;
  const next =
    typeof params.next === "string" && params.next.startsWith("/")
      ? params.next
      : undefined;

  return (
    <div className="min-h-screen app-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <p className="font-display text-4xl text-aarla-red tracking-tight">
            Aarla OS
          </p>
          <p className="mt-2 text-sm text-charcoal/60">
            Sign in to continue
          </p>
        </div>
        <LoginForm nextPath={next} />
        <p className="mt-6 text-center text-xs text-charcoal/50">
          First deploy? Run{" "}
          <a href="/setup" className="text-deep-navy underline underline-offset-2">
            /setup
          </a>{" "}
          with your setup secret before signing in.
        </p>
      </div>
    </div>
  );
}
