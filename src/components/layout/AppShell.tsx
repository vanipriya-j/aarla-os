"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { CommerceSyncProvider } from "@/components/customer-calls/CommerceSyncProvider";
import { CommerceSyncGlobalBanner } from "@/components/customer-calls/CommerceSyncGlobalBanner";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bare =
    pathname === "/setup" ||
    pathname === "/login" ||
    pathname.startsWith("/api/");

  if (bare) {
    return <>{children}</>;
  }

  return (
    <CommerceSyncProvider>
      <div className="app-bg min-h-screen flex">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <CommerceSyncGlobalBanner />
          {children}
        </div>
      </div>
    </CommerceSyncProvider>
  );
}
