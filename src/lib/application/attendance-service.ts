import { createAttendanceRepository } from "@/lib/infra/repositories/postgres-attendance";
import { getRequestAuth } from "@/lib/auth/request-auth";
import {
  ATTENDANCE_STATUSES,
  attendanceTodayIso,
  isAttendanceStatus,
  staffCodeFromName,
  type AddAttendanceStaffInput,
  type AttendanceDayBoard,
  type AttendanceStaff,
  type UpsertAttendanceMarkInput,
} from "@/lib/domain/attendance-types";
import type { AttendanceRepository } from "@/lib/repositories/attendance";

const TIMEZONE = "Asia/Kolkata";

function repo(): AttendanceRepository {
  return createAttendanceRepository();
}

function mapStaff(row: {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}): AttendanceStaff {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

export async function getAttendanceDayBoard(workDateIso?: string): Promise<AttendanceDayBoard> {
  const r = repo();
  const today = attendanceTodayIso();
  const workDate = workDateIso && /^\d{4}-\d{2}-\d{2}$/.test(workDateIso) ? workDateIso : today;

  const [staffRows, recordRows] = await Promise.all([
    r.listStaff(true),
    r.listRecordsForDate(workDate),
  ]);

  const byStaff = new Map(recordRows.map((rec) => [rec.staffId, rec]));
  const staff = staffRows.map(mapStaff);
  const marks = staff.map((s) => {
    const rec = byStaff.get(s.id);
    return {
      staffId: s.id,
      status: rec?.status ?? null,
      notes: rec?.notes ?? "",
      markedBy: rec?.markedBy ?? null,
      markedAt: rec?.markedAt ?? null,
    };
  });

  const counts = {
    present: 0,
    absent: 0,
    halfDay: 0,
    leave: 0,
    unmarked: 0,
  };
  for (const m of marks) {
    if (m.status === "present") counts.present += 1;
    else if (m.status === "absent") counts.absent += 1;
    else if (m.status === "half-day") counts.halfDay += 1;
    else if (m.status === "leave") counts.leave += 1;
    else counts.unmarked += 1;
  }

  return {
    workDate,
    timezone: TIMEZONE,
    isToday: workDate === today,
    staff,
    marks,
    counts,
  };
}

export async function upsertAttendanceMark(
  input: UpsertAttendanceMarkInput,
): Promise<AttendanceDayBoard> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
    throw new Error("Invalid work date.");
  }
  if (!isAttendanceStatus(input.status)) {
    throw new Error(`Status must be one of: ${ATTENDANCE_STATUSES.join(", ")}`);
  }
  const auth = await getRequestAuth();
  const r = repo();
  await r.upsertRecord({
    staffId: input.staffId,
    workDate: input.workDate,
    status: input.status,
    notes: (input.notes ?? "").trim(),
    markedBy: auth.username || "founder",
  });
  return getAttendanceDayBoard(input.workDate);
}

export async function addAttendanceStaff(
  input: AddAttendanceStaffInput,
): Promise<AttendanceDayBoard> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const r = repo();
  const existing = await r.listStaff(false);
  let code = staffCodeFromName(name);
  const codes = new Set(existing.map((s) => s.code));
  if (codes.has(code)) {
    let i = 2;
    while (codes.has(`${code}-${i}`)) i += 1;
    code = `${code}-${i}`;
  }
  const maxSort = existing.reduce((m, s) => Math.max(m, s.sortOrder), 0);
  await r.insertStaff({ code, name, sortOrder: maxSort + 10 });
  return getAttendanceDayBoard();
}

export async function deactivateAttendanceStaff(staffId: string): Promise<AttendanceDayBoard> {
  const r = repo();
  const updated = await r.setStaffActive(staffId, false);
  if (!updated) throw new Error("Staff member not found.");
  return getAttendanceDayBoard();
}

export async function listAttendanceStaffAll(): Promise<AttendanceStaff[]> {
  const rows = await repo().listStaff(false);
  return rows.map(mapStaff);
}
