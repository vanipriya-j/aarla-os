"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { navForRole } from "@/lib/auth/nav";
import { homePathForRole } from "@/lib/auth/roles";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { role, authEnabled } = useAuth();
  const nav = navForRole(role);
  const homeHref = homePathForRole(role);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-warm-cream/90 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4 px-4 md:px-8 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden mt-1 h-9 w-9 rounded-xl border border-border bg-white flex items-center justify-center text-deep-navy"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-aarla-red mb-1 lg:hidden">
                Aarla OS
              </p>
              <h1 className="font-display text-2xl md:text-3xl text-deep-navy truncate">{title}</h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-charcoal/65 max-w-2xl">{subtitle}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="hidden sm:flex items-center gap-2 shrink-0">{actions}</div> : null}
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-deep-navy/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-white border-r border-border p-4 overflow-y-auto animate-fade-up">
            <div className="flex items-center justify-between mb-6">
              <p className="font-display text-xl text-aarla-red">Aarla OS</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-lg hover:bg-pale-cream flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="space-y-1">
              {nav.showHome ? (
                <Link
                  href={homeHref}
                  onClick={() => setOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 text-sm ${
                    pathname === "/"
                      ? "bg-aarla-red text-white"
                      : "text-deep-navy hover:bg-pale-cream"
                  }`}
                >
                  Home
                </Link>
              ) : null}
              {nav.workflows.length > 0 ? (
                <>
                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-charcoal/45">
                    Workflows
                  </p>
                  {nav.workflows.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`block rounded-xl px-3 py-2.5 text-sm ${
                        pathname === item.href || pathname.startsWith(`${item.href}/`)
                          ? "bg-aarla-red text-white"
                          : "text-deep-navy hover:bg-pale-cream"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </>
              ) : null}
              {nav.network.length > 0 ? (
                <>
                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-charcoal/45">
                    Network
                  </p>
                  {nav.network.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`block rounded-xl px-3 py-2.5 text-sm ${
                        pathname === item.href || pathname.startsWith(`${item.href}/`)
                          ? "bg-aarla-red text-white"
                          : "text-deep-navy hover:bg-pale-cream"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </>
              ) : null}
              {nav.outreach.length > 0 ? (
                <>
                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-charcoal/45">
                    Outreach
                  </p>
                  {nav.outreach.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`block rounded-xl px-3 py-2.5 text-sm ${
                        pathname === item.href || pathname.startsWith(`${item.href}/`)
                          ? "bg-aarla-red text-white"
                          : "text-deep-navy hover:bg-pale-cream"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </>
              ) : null}
              {authEnabled ? (
                <div className="mt-4 px-3 pt-3 border-t border-border">
                  <LogoutButton />
                </div>
              ) : null}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
