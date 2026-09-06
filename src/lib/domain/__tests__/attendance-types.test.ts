import { describe, expect, it } from "vitest";
import {
  attendanceTodayIso,
  isAttendanceStatus,
  shiftAttendanceDate,
  staffCodeFromName,
} from "@/lib/domain/attendance-types";

describe("attendance-types", () => {
  it("formats today in Asia/Kolkata as YYYY-MM-DD", () => {
    const iso = attendanceTodayIso(new Date("2026-09-06T18:30:00.000Z"));
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 18:30 UTC is 00:00 next day IST → 7 Sep
    expect(iso).toBe("2026-09-07");
  });

  it("shifts calendar dates by day", () => {
    expect(shiftAttendanceDate("2026-09-06", 1)).toBe("2026-09-07");
    expect(shiftAttendanceDate("2026-09-06", -1)).toBe("2026-09-05");
  });

  it("validates statuses", () => {
    expect(isAttendanceStatus("present")).toBe(true);
    expect(isAttendanceStatus("half-day")).toBe(true);
    expect(isAttendanceStatus("late")).toBe(false);
  });

  it("builds stable staff codes from names", () => {
    expect(staffCodeFromName("Priya Sharma")).toBe("staff-priya-sharma");
    expect(staffCodeFromName("  ")).toBe("staff-member");
  });
});
