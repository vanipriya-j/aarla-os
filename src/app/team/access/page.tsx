"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { listAccessRolesAction } from "@/app/actions/team-actions";
import type { AccessRole } from "@/lib/domain/team-types";

export default function TeamAccessPage() {
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccessRolesAction()
      .then(setRoles)
      .catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, []);

  return (
    <>
      <Header
        title="Access"
        subtitle="Roles and module permissions for internal accounts."
        actions={
          <Link href="/team">
            <Button size="sm" variant="outline">
              Team
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-4 max-w-4xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {roles.map((role) => (
          <div
            key={role.id}
            className="rounded-2xl border border-border bg-white/90 px-5 py-4 space-y-2"
            data-testid={`access-role-${role.code}`}
          >
            <p className="font-display text-xl text-deep-navy">{role.label}</p>
            <p className="text-sm text-charcoal/55">{role.description}</p>
            <p className="text-xs text-charcoal/45 font-mono">{role.code}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {role.permissionCodes.map((p) => (
                <span
                  key={p}
                  className="text-[11px] rounded-md border border-border bg-pale-cream px-2 py-0.5 text-deep-navy"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-charcoal/45">
          Assign roles when adding a team member. Finance, vendor costs, and admin settings
          stay off Operations / Collaborator by default.
        </p>
      </main>
    </>
  );
}
