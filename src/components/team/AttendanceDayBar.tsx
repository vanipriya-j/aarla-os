"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getMyAttendanceGateAction } from "@/app/actions/team-actions";
import { formatAttendanceClock } from "@/lib/domain/team-types";

/**
 * Soft gate for team accounts: nudge to change PIN / check in / check out.
 * Does not interrupt admin/crm.
 */
export function AttendanceDayBar() {
  const { role, accountId } = useAuth();
  const pathname = usePathname();
  const [label, setLabel] = useState<string | null>(null);
  const [checkOutHref, setCheckOutHref] = useState(false);
  const [forceHref, setForceHref] = useState<string | null>(null);

  const skip =
    role !== "team" ||
    !accountId ||
    pathname.startsWith("/attendance/") ||
    pathname.startsWith("/account/") ||
    pathname === "/login";

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    getMyAttendanceGateAction().then((gate) => {
      if (cancelled) return;
      if (gate.kind === "change_pin") {
        setForceHref("/account/change-pin");
        return;
      }
      if (gate.kind === "missed_checkout") {
        setForceHref("/attendance/check-in");
        return;
      }
      if (gate.kind === "check_in") {
        setForceHref("/attendance/check-in");
        return;
      }
      if (gate.kind === "ok" && gate.session?.checkInAt && !gate.session.checkOutAt) {
        setLabel(`At work since ${formatAttendanceClock(gate.session.checkInAt)}`);
        setCheckOutHref(true);
        setForceHref(null);
        return;
      }
      setForceHref(null);
      setLabel(null);
      setCheckOutHref(false);
    });
    return () => {
      cancelled = true;
    };
  }, [skip, pathname, accountId]);

  useEffect(() => {
    if (forceHref && pathname !== forceHref) {
      window.location.assign(forceHref);
    }
  }, [forceHref, pathname]);

  if (skip || !label) return null;

  return (
    <div
      className="border-b border-border bg-white/85 px-4 md:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-sm"
      data-testid="attendance-day-bar"
    >
      <span className="text-deep-navy">{label}</span>
      {checkOutHref ? (
        <Link
          href="/attendance/check-out"
          className="text-aarla-red font-medium hover:underline"
          data-testid="nav-check-out"
        >
          Check out
        </Link>
      ) : null}
    </div>
  );
}
