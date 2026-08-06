"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, next: nextPath }),
        });
        const body = (await res.json()) as {
          error?: string;
          redirectTo?: string;
        };
        if (!res.ok) {
          setError(body.error || "Sign in failed");
          return;
        }
        router.replace(body.redirectTo || "/");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-white/90 p-6 shadow-[var(--shadow-md)] space-y-4"
      data-testid="login-form"
    >
      <div>
        <label
          htmlFor="username"
          className="block text-xs font-semibold uppercase tracking-wider text-charcoal/55 mb-1.5"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          data-testid="login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-xl border border-border bg-pale-cream px-3 py-2.5 text-sm text-deep-navy outline-none focus:border-deep-navy/40"
          required
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="block text-xs font-semibold uppercase tracking-wider text-charcoal/55 mb-1.5"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          data-testid="login-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-pale-cream px-3 py-2.5 text-sm text-deep-navy outline-none focus:border-deep-navy/40"
          required
        />
      </div>
      {error ? (
        <p className="text-sm text-aarla-red" data-testid="login-error">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        data-testid="login-submit"
        className="w-full rounded-xl bg-aarla-red text-white text-sm font-medium py-2.5 hover:opacity-95 disabled:opacity-60 transition"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
