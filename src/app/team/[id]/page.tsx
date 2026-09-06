"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { FormSection, Field, inputClass } from "@/components/ui/FormSection";
import {
  getTeamMemberAction,
  setAccountStatusAction,
  updateTeamMemberAction,
} from "@/app/actions/team-actions";
import type { TeamRelationship } from "@/lib/domain/team-types";

export default function TeamMemberDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [member, setMember] = useState<TeamRelationship | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reload = () => {
    start(async () => {
      try {
        const m = await getTeamMemberAction(id);
        setMember(m);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Load failed");
      }
    });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!member && !error) {
    return (
      <>
        <Header title="Team member" subtitle="Loading…" />
        <main className="px-4 md:px-8 py-8">Loading…</main>
      </>
    );
  }

  if (!member) {
    return (
      <>
        <Header title="Team member" />
        <main className="px-4 md:px-8 py-8 text-aarla-red">{error}</main>
      </>
    );
  }

  return (
    <>
      <Header
        title={member.displayName}
        subtitle={`${member.teamFunction} · ${member.relationshipType}`}
        actions={
          <Link href="/team">
            <Button size="sm" variant="outline">
              Team
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-3xl">
        <div className="flex flex-wrap gap-2">
          <StatusChip
            label={member.active ? "Active" : "Inactive"}
            tone={member.active ? "success" : "neutral"}
          />
          {member.accountStatus ? (
            <StatusChip
              label={`Account ${member.accountStatus}`}
              tone={member.accountStatus === "active" ? "info" : "danger"}
            />
          ) : null}
          {member.username ? (
            <StatusChip label={`@${member.username}`} tone="neutral" />
          ) : null}
        </div>

        <FormSection title="Work">
          <p className="text-sm text-charcoal/70">
            Location: {member.defaultLocationName || "—"}
          </p>
          <p className="text-sm text-charcoal/70">
            Attendance: {member.attendanceRequired ? "Required" : "Not required"}
          </p>
          <p className="text-sm text-charcoal/70">
            Window:{" "}
            {member.expectedStartTime || "—"} – {member.expectedEndTime || "—"}
          </p>
          <p className="text-sm text-charcoal/70">
            Access: {member.accessRoleCodes.join(", ") || "—"}
          </p>
          <p className="text-sm text-charcoal/70">
            Person code: <code>{member.personCode}</code> (CRM People link)
          </p>
        </FormSection>

        <FormSection title="Actions">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                start(async () => {
                  await updateTeamMemberAction(member.id, {
                    active: !member.active,
                  });
                  setMsg(member.active ? "Deactivated (history kept)." : "Reactivated.");
                  reload();
                });
              }}
            >
              {member.active ? "Deactivate team link" : "Reactivate"}
            </Button>
            {member.username ? (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  setMsg(null);
                  start(async () => {
                    const next =
                      member.accountStatus === "disabled" ? "active" : "disabled";
                    const res = await setAccountStatusAction(member.username!, next);
                    if (!res.ok) setError(res.error);
                    else {
                      setMsg(
                        next === "disabled"
                          ? "Account disabled — login denied; history kept."
                          : "Account enabled.",
                      );
                      reload();
                    }
                  });
                }}
              >
                {member.accountStatus === "disabled" ? "Enable account" : "Disable account"}
              </Button>
            ) : null}
          </div>
          {msg ? <p className="text-sm text-muted-green">{msg}</p> : null}
          {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        </FormSection>

        <Field label="Title">
          <input className={inputClass} defaultValue={member.roleTitle} readOnly />
        </Field>
      </main>
    </>
  );
}
