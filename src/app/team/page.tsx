"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { listTeamOverviewAction } from "@/app/actions/team-actions";
import {
  formatAttendanceClock,
  type TeamMemberCard,
  type TeamOverviewMetrics,
} from "@/lib/domain/team-types";
import { Users, UserCheck, UserX, AlertTriangle } from "lucide-react";

function statusTone(status: TeamMemberCard["today"]) {
  switch (status) {
    case "PRESENT":
      return "success" as const;
    case "CHECKED_OUT":
      return "info" as const;
    case "NOT_YET_IN":
      return "neutral" as const;
    case "MISSED_CHECKOUT":
    case "ABSENT":
      return "danger" as const;
    case "MANUAL_CORRECTION":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function statusLabel(status: TeamMemberCard["today"]) {
  switch (status) {
    case "PRESENT":
      return "At work";
    case "CHECKED_OUT":
      return "Checked out";
    case "NOT_YET_IN":
      return "Not checked in";
    case "MISSED_CHECKOUT":
      return "Missed checkout";
    case "ATTENDANCE_NOT_REQUIRED":
      return "Attendance not required";
    case "MANUAL_CORRECTION":
      return "Manual correction";
    case "ABSENT":
      return "Absent";
    default:
      return status;
  }
}

export default function TeamPage() {
  const [metrics, setMetrics] = useState<TeamOverviewMetrics | null>(null);
  const [cards, setCards] = useState<TeamMemberCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    start(async () => {
      try {
        const data = await listTeamOverviewAction();
        setMetrics(data.metrics);
        setCards(data.cards);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load team");
      }
    });
  }, []);

  return (
    <>
      <Header
        title="Team"
        subtitle="Internal Aarla people — check-in, access, work locations."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/team/attendance">
              <Button size="sm" variant="outline">
                Attendance
              </Button>
            </Link>
            <Link href="/team/new">
              <Button size="sm" data-testid="team-add-member">
                Add Team Member
              </Button>
            </Link>
          </div>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        <section className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <SummaryCard
            label="Active"
            value={metrics ? String(metrics.activeMembers) : pending ? "…" : "0"}
            icon={Users}
          />
          <SummaryCard
            label="Checked in"
            value={metrics ? String(metrics.checkedIn) : "—"}
            accent="green"
            icon={UserCheck}
          />
          <SummaryCard
            label="Not in yet"
            value={metrics ? String(metrics.notCheckedIn) : "—"}
            accent="orange"
            icon={UserX}
          />
          <SummaryCard
            label="Missed checkout"
            value={metrics ? String(metrics.missedCheckout) : "—"}
            accent="red"
          />
          <SummaryCard
            label="Exceptions"
            value={metrics ? String(metrics.exceptions) : "—"}
            icon={AlertTriangle}
          />
        </section>

        <section className="space-y-3" data-testid="team-member-list">
          {cards.map((card) => (
            <div
              key={card.team.id}
              className="card-surface rounded-2xl border border-border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
              data-testid={`team-card-${card.team.username || card.team.id}`}
            >
              <div className="min-w-0 space-y-1">
                <p className="font-display text-xl text-deep-navy">
                  {card.team.displayName}
                </p>
                <p className="text-sm text-charcoal/60">
                  {card.team.teamFunction}
                  {card.team.defaultLocationName
                    ? ` · ${card.team.defaultLocationName}`
                    : ""}
                  {card.team.roleTitle ? ` · ${card.team.roleTitle}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StatusChip
                    label={
                      card.today === "PRESENT"
                        ? `🟢 ${statusLabel(card.today)}`
                        : statusLabel(card.today)
                    }
                    tone={statusTone(card.today)}
                  />
                  {card.checkInAt ? (
                    <span className="text-xs text-charcoal/55">
                      Checked in {formatAttendanceClock(card.checkInAt)}
                    </span>
                  ) : card.expectedLabel ? (
                    <span className="text-xs text-charcoal/55">{card.expectedLabel}</span>
                  ) : null}
                </div>
              </div>
              <Link href={`/team/${card.team.id}`}>
                <Button size="sm" variant="outline">
                  View
                </Button>
              </Link>
            </div>
          ))}
          {!pending && !cards.length ? (
            <p className="text-sm text-charcoal/55">
              No team members yet. Add Shreen or Dhilip to get started.
            </p>
          ) : null}
        </section>

        <p className="text-xs text-charcoal/45 max-w-2xl">
          Privacy: check-in and check-out camera images are stored only as attendance
          evidence for authenticated admins — not used for face recognition.
        </p>
      </main>
    </>
  );
}
