export const ATTENDANCE_STATUSES = ["present", "absent", "half-day", "leave"] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  "half-day": "Half day",
  leave: "Leave",
};

export type AttendanceStaff = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export type AttendanceMark = {
  staffId: string;
  status: AttendanceStatus | null;
  notes: string;
  markedBy: string | null;
  markedAt: string | null;
};

export type AttendanceDayBoard = {
  workDate: string;
  timezone: string;
  isToday: boolean;
  staff: AttendanceStaff[];
  marks: AttendanceMark[];
  counts: {
    present: number;
    absent: number;
    halfDay: number;
    leave: number;
    unmarked: number;
  };
};

export type UpsertAttendanceMarkInput = {
  staffId: string;
  workDate: string;
  status: AttendanceStatus;
  notes?: string;
};

export type AddAttendanceStaffInput = {
  name: string;
};

/** YYYY-MM-DD in Asia/Kolkata. */
export function attendanceTodayIso(
  now: Date = new Date(),
  timeZone = "Asia/Kolkata",
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shiftAttendanceDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export function staffCodeFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `staff-${slug || "member"}`;
}
