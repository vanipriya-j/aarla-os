"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { Field, inputClass } from "@/components/ui/FormSection";
import {
  adminCorrectAttendanceAction,
  listAttendanceBoardAction,
  listAttendanceWeekAction,
} from "@/app/actions/team-actions";
import {
  formatAttendanceClock,
  type AttendanceSession,
  type TeamMemberCard,
  workDateInTimezone,
} from "@/lib/domain/team-types";

export default function TeamAttendancePage() {
  const [date, setDate] = useState(workDateInTimezone());
  const [cards, setCards] = useState<TeamMemberCard[]>([]);
  const [week, setWeek] = useState<AttendanceSession[]>([]);
  const [view, setView] = useState<"today" | "week">("today");
  const [error, setError] = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [correctTime, setCorrectTime] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [pending, start] = useTransition();

  const load = (d = date) => {
    start(async () => {
      try {
        const board = await listAttendanceBoardAction(d);
        setCards(board.overview.cards);
        setDate(board.date);
        const w = await listAttendanceWeekAction(d);
        setWeek(w);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Load failed");
      }
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Header
        title="Attendance"
        subtitle="Today’s board — operational, not payroll."
        actions={
          <Link href="/team">
            <Button size="sm" variant="outline">
              Team
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Date">
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Button type="button" variant="secondary" onClick={() => load(date)} disabled={pending}>
            Refresh
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={view === "today" ? "primary" : "outline"}
              onClick={() => setView("today")}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "week" ? "primary" : "outline"}
              onClick={() => setView("week")}
            >
              Week
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}

        {view === "today" ? (
          <div className="overflow-x-auto rounded-2xl border border-border bg-white/90">
            <table className="min-w-full text-sm" data-testid="attendance-board">
              <thead className="text-left text-xs uppercase tracking-wider text-charcoal/45 border-b border-border">
                <tr>
                  <th className="px-4 py-3">Team member</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Check-in</th>
                  <th className="px-4 py-3">Check-out</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.team.id} className="border-b border-border/70">
                    <td className="px-4 py-3 font-medium text-deep-navy">
                      {c.team.displayName}
                      <div className="text-xs text-charcoal/45 font-normal">
                        {c.team.teamFunction}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip label={c.today} tone="neutral" />
                    </td>
                    <td className="px-4 py-3">{formatAttendanceClock(c.checkInAt) || "—"}</td>
                    <td className="px-4 py-3">{formatAttendanceClock(c.checkOutAt) || "—"}</td>
                    <td className="px-4 py-3 text-charcoal/60">{c.expectedLabel || "—"}</td>
                    <td className="px-4 py-3">{c.team.defaultLocationName || "—"}</td>
                    <td className="px-4 py-3">
                      {c.today === "MISSED_CHECKOUT" || c.today === "PRESENT" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => setCorrectId(c.team.id)}
                        >
                          Correct
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2" data-testid="attendance-week">
            {week.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-border bg-white/90 px-4 py-3 text-sm flex flex-wrap gap-3 justify-between"
              >
                <span className="font-medium text-deep-navy">
                  {s.displayName} · {s.workDate}
                </span>
                <span>{s.status}</span>
                <span>
                  {formatAttendanceClock(s.checkInAt) || "—"} →{" "}
                  {formatAttendanceClock(s.checkOutAt) || "—"}
                </span>
              </div>
            ))}
            {!week.length ? (
              <p className="text-sm text-charcoal/55">No sessions this week yet.</p>
            ) : null}
          </div>
        )}

        {correctId ? (
          <div className="rounded-2xl border border-border bg-white p-4 space-y-3 max-w-md">
            <p className="font-medium text-deep-navy">Manual correction</p>
            <p className="text-xs text-charcoal/55">
              Corrections are audited — nothing is silently overwritten.
            </p>
            <Field label="Approximate checkout time">
              <input
                type="datetime-local"
                className={inputClass}
                value={correctTime}
                onChange={(e) => setCorrectTime(e.target.value)}
              />
            </Field>
            <Field label="Reason">
              <input
                className={inputClass}
                value={correctReason}
                onChange={(e) => setCorrectReason(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  start(async () => {
                    // Find session for this team card on the board date via week/list
                    const session = week.find(
                      (s) =>
                        s.teamRelationshipId === correctId ||
                        cards.find((c) => c.team.id === correctId)?.team.personId ===
                          s.personId,
                    );
                    // Prefer today's session from overview path — load sessions board again
                    const board = await listAttendanceBoardAction(date);
                    const personId = cards.find((c) => c.team.id === correctId)?.team
                      .personId;
                    const sess = board.sessions.find((s) => s.personId === personId);
                    if (!sess) {
                      setError("No session to correct");
                      return;
                    }
                    void session;
                    let checkOutAt = correctTime;
                    if (checkOutAt && !checkOutAt.includes("Z") && !checkOutAt.includes("+")) {
                      checkOutAt = `${checkOutAt}:00+05:30`;
                    }
                    const res = await adminCorrectAttendanceAction({
                      sessionId: sess.id,
                      reason: correctReason,
                      checkOutAt: checkOutAt
                        ? new Date(checkOutAt).toISOString()
                        : null,
                    });
                    if (!res.ok) setError(res.error);
                    else {
                      setCorrectId(null);
                      setCorrectReason("");
                      setCorrectTime("");
                      load(date);
                    }
                  });
                }}
              >
                Save correction
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCorrectId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-charcoal/45">
          Camera images are attendance evidence only — not biometric identity matching.
        </p>
      </main>
    </>
  );
}
