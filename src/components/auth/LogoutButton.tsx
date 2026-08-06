"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        /* still leave */
      }
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      data-testid="logout-button"
      className={`inline-flex items-center gap-2 text-sm text-deep-navy hover:text-aarla-red disabled:opacity-60 transition ${className}`}
    >
      <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
