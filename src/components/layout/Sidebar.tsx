"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { networkNav, outreachNav, primaryTiles } from "@/lib/navigation";
import { Boxes } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="hidden lg:flex w-[260px] shrink-0 flex-col border-r border-border bg-white/80 backdrop-blur-sm min-h-screen sticky top-0">
      <div className="px-5 py-6 border-b border-border">
        <Link href="/" className="block group">
          <p className="font-display text-2xl text-aarla-red tracking-tight group-hover:opacity-90">
            Aarla OS
          </p>
          <p className="mt-1 text-xs text-charcoal/55 tracking-wide">Founder operating system</p>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <Link
          href="/"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
            isActive("/")
              ? "bg-aarla-red text-white"
              : "text-deep-navy hover:bg-pale-cream"
          }`}
        >
          <Boxes className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="font-medium">Home</span>
        </Link>

        <p className="px-3 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-charcoal/45">
          Workflows
        </p>

        {primaryTiles.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-aarla-red text-white"
                  : "text-deep-navy hover:bg-pale-cream"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="font-medium leading-snug">{item.label}</span>
            </Link>
          );
        })}

        <p className="px-3 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-charcoal/45">
          Network
        </p>

        {networkNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-aarla-red text-white"
                  : "text-deep-navy hover:bg-pale-cream"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="font-medium leading-snug">{item.label}</span>
            </Link>
          );
        })}

        <p className="px-3 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-charcoal/45">
          Outreach
        </p>

        {outreachNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid="nav-customer-calls"
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-aarla-red text-white"
                  : "text-deep-navy hover:bg-pale-cream"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="font-medium leading-snug">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="rounded-xl bg-pale-cream border border-border p-3">
          <p className="text-xs font-medium text-deep-navy">Version 0.2 · Domain Phase 1</p>
          <p className="mt-1 text-xs text-charcoal/55 leading-relaxed">
            One catalog · one ledger
          </p>
        </div>
      </div>
    </aside>
  );
}
