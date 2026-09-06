"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { FormSection, Field, inputClass } from "@/components/ui/FormSection";
import {
  addAttendanceStaffAction,
  deactivateAttendanceStaffAction,
  getAttendanceDayBoardAction,
  upsertAttendanceMarkAction,
} from "@/app/actions/attendance-actions";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  attendanceTodayIso,
  shiftAttendanceDate,
  type AttendanceDayBoard,
  type AttendanceStatus,
} from "@/lib/domain/attendance-types";

export default function AttendancePage() {
  const [board, setBoard] = useState<AttendanceDayBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  const load = useCallback((workDate?: string) => {
    startTransition(async () => {
      setError(null);
      const res = await getAttendanceDayBoardAction(workDate);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBoard(res.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function go(delta: number) {
    if (!board) return;
    load(shiftAttendanceDate(board.workDate, delta));
  }

  function mark(staffId: string, status: AttendanceStatus) {
    if (!board) return;
    startTransition(async () => {
      setError(null);
      const res = await upsertAttendanceMarkAction({
        staffId,
        workDate: board.workDate,
        status,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBoard(res.data);
    });
  }

  function addStaff() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      setError(null);
      const res = await addAttendanceStaffAction({ name });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewName("");
      setBoard(res.data);
    });
  }

  function deactivate(staffId: string) {
    startTransition(async () => {
      setError(null);
      const res = await deactivateAttendanceStaffAction(staffId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBoard(res.data);
    });
  }

  const markByStaff = new Map(board?.marks.map((m) => [m.staffId, m]) ?? []);

  return (
    <>
      <Header
        title="Attendance"
        subtitle="Who is in today — mark present, absent, half day, or leave."
      />
      <main
        className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-4xl"
        data-testid="attendance-page"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-2xl text-deep-navy">
              {board?.workDate ?? "Loading…"}
            </p>
            <p className="text-sm text-charcoal/55">
              {board?.timezone ?? "Asia/Kolkata"}
              {board?.isToday ? " · today" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="attendance-prev"
              onClick={() => go(-1)}
              disabled={pending || !board}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              type="button"
              data-testid="attendance-today"
              onClick={() => load(attendanceTodayIso())}
              disabled={pending}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Today
            </button>
            <button
              type="button"
              data-testid="attendance-next"
              onClick={() => go(1)}
              disabled={pending || !board}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => board && load(board.workDate)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full bg-deep-navy text-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-aarla-red">
            {error}
            {" — "}
            <Link href="/setup" className="underline">
              run /setup
            </Link>{" "}
            if attendance tables are missing.
          </p>
        ) : null}

        {board ? (
          <p className="text-sm text-charcoal/60" data-testid="attendance-counts">
            Present {board.counts.present}
            {" · "}Absent {board.counts.absent}
            {" · "}Half day {board.counts.halfDay}
            {" · "}Leave {board.counts.leave}
            {" · "}Unmarked {board.counts.unmarked}
          </p>
        ) : null}

        <FormSection
          title="Day board"
          description="Tap a status for each person. One mark per person per day."
        >
          {!board && !error ? (
            <p className="text-sm text-charcoal/50">Loading attendance…</p>
          ) : null}

          {board && board.staff.length === 0 ? (
            <p className="text-sm text-charcoal/60">
              No team members yet — add names in Team below.
            </p>
          ) : null}

          {board ? (
            <ul className="space-y-3">
              {board.staff.map((person) => {
                const markRow = markByStaff.get(person.id);
                const current = markRow?.status ?? null;
                return (
                  <li
                    key={person.id}
                    className="border border-border rounded-lg px-3 py-3"
                    data-testid={`attendance-row-${person.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-deep-navy">{person.name}</p>
                      <button
                        type="button"
                        disabled={pending}
                        className="text-xs text-charcoal/50 underline disabled:opacity-50"
                        onClick={() => deactivate(person.id)}
                      >
                        Remove from roster
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {ATTENDANCE_STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={pending}
                          data-testid={`attendance-mark-${person.id}-${status}`}
                          className={`text-xs px-3 py-1.5 rounded-full border disabled:opacity-50 ${
                            current === status
                              ? status === "absent"
                                ? "border-aarla-red bg-aarla-red/10 text-aarla-red"
                                : "border-deep-navy bg-deep-navy text-white"
                              : "border-border bg-white text-deep-navy"
                          }`}
                          onClick={() => mark(person.id, status)}
                        >
                          {current === status ? "✓ " : ""}
                          {ATTENDANCE_STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </FormSection>

        <FormSection title="Team" description="Add people who should appear on the day board.">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Name">
              <input
                className={inputClass}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Priya"
                data-testid="attendance-staff-name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStaff();
                  }
                }}
              />
            </Field>
            <button
              type="button"
              disabled={pending || !newName.trim()}
              data-testid="attendance-staff-add"
              onClick={addStaff}
              className="inline-flex items-center gap-1 rounded-full bg-deep-navy text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </FormSection>
      </main>
    </>
  );
}
