import { describe, expect, it } from "vitest";
import {
  dayIndexInWeek,
  expectedWtd,
  isoDate,
  metricStatus,
  shiftWeek,
  weekRange,
  weekStartMonday,
} from "@/lib/domain/operating-week";

describe("weekStartMonday", () => {
  it("returns the same date for a Monday", () => {
    // 2026-08-10 is a Monday.
    const monday = weekStartMonday(new Date("2026-08-10T09:00:00.000Z"));
    expect(isoDate(monday)).toBe("2026-08-10");
  });

  it("resolves mid-week dates back to Monday", () => {
    // 2026-08-13 (Thursday) IST.
    const monday = weekStartMonday(new Date("2026-08-13T10:00:00.000Z"));
    expect(isoDate(monday)).toBe("2026-08-10");
  });

  it("resolves Sunday to the Monday that started that week", () => {
    // 2026-08-16 is a Sunday.
    const monday = weekStartMonday(new Date("2026-08-16T12:00:00.000Z"));
    expect(isoDate(monday)).toBe("2026-08-10");
  });

  it("rolls over to the next week right at the Asia/Kolkata Monday-midnight boundary", () => {
    // 2026-08-16T18:29:00Z is 2026-08-16 23:59 IST — still Sunday of the prior week.
    const stillSunday = weekStartMonday(new Date("2026-08-16T18:29:00.000Z"));
    expect(isoDate(stillSunday)).toBe("2026-08-10");

    // 2026-08-16T18:30:00Z is 2026-08-17 00:00 IST — Monday of the next week.
    const nextMonday = weekStartMonday(new Date("2026-08-16T18:30:00.000Z"));
    expect(isoDate(nextMonday)).toBe("2026-08-17");
  });
});

describe("weekRange", () => {
  it("spans Monday 00:00 IST through the following Monday 00:00 IST", () => {
    const weekStart = weekStartMonday(new Date("2026-08-10T09:00:00.000Z"));
    const range = weekRange(weekStart);

    // Monday 00:00 IST == Sunday 18:30 UTC.
    expect(range.start.toISOString()).toBe("2026-08-09T18:30:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-08-16T18:30:00.000Z");
    expect(range.endExclusive.getTime() - range.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("produces a human label spanning Monday through Sunday", () => {
    const weekStart = weekStartMonday(new Date("2026-08-10T09:00:00.000Z"));
    const range = weekRange(weekStart);
    expect(range.label).toBe("10 Aug – 16 Aug 2026");
  });
});

describe("shiftWeek", () => {
  it("moves forward and backward by whole weeks", () => {
    const weekStart = weekStartMonday(new Date("2026-08-10T09:00:00.000Z"));
    expect(isoDate(shiftWeek(weekStart, 1))).toBe("2026-08-17");
    expect(isoDate(shiftWeek(weekStart, -1))).toBe("2026-08-03");
    expect(isoDate(shiftWeek(weekStart, 0))).toBe("2026-08-10");
  });
});

describe("dayIndexInWeek", () => {
  const weekStart = weekStartMonday(new Date("2026-08-10T09:00:00.000Z"));

  it("is 0 on Monday and 6 on Sunday, within the same week", () => {
    expect(dayIndexInWeek(new Date("2026-08-10T09:00:00.000Z"), weekStart)).toBe(0);
    expect(dayIndexInWeek(new Date("2026-08-16T12:00:00.000Z"), weekStart)).toBe(6);
  });

  it("counts each calendar day in between correctly", () => {
    expect(dayIndexInWeek(new Date("2026-08-13T10:00:00.000Z"), weekStart)).toBe(3); // Thu
  });

  it("is negative for a date before the week starts", () => {
    expect(dayIndexInWeek(new Date("2026-08-03T09:00:00.000Z"), weekStart)).toBe(-7);
  });

  it("is greater than 6 for a date after the week ends", () => {
    expect(dayIndexInWeek(new Date("2026-08-17T09:00:00.000Z"), weekStart)).toBe(7);
  });
});

describe("expectedWtd", () => {
  it("scales by days elapsed within the current week (index + 1)", () => {
    expect(expectedWtd(100, 0)).toBe(100); // Monday: 1 day elapsed
    expect(expectedWtd(100, 3)).toBe(400); // Thursday: 4 days elapsed
    expect(expectedWtd(100, 6)).toBe(700); // Sunday: 7 days elapsed
  });

  it("is 0 for a future week", () => {
    expect(expectedWtd(100, -1)).toBe(0);
  });

  it("is the full 7 days for a fully-elapsed past week", () => {
    expect(expectedWtd(100, 7)).toBe(700);
    expect(expectedWtd(100, 30)).toBe(700);
  });
});

describe("metricStatus", () => {
  it("is DONE once actual meets or exceeds the target", () => {
    expect(metricStatus(700, 700, 400)).toBe("DONE");
    expect(metricStatus(800, 700, 400)).toBe("DONE");
  });

  it("is ON TRACK at or above 90% of expected week-to-date", () => {
    expect(metricStatus(360, 700, 400)).toBe("ON TRACK"); // 90% exactly
    expect(metricStatus(400, 700, 400)).toBe("ON TRACK");
  });

  it("is AT RISK between 60% and 90% of expected", () => {
    expect(metricStatus(240, 700, 400)).toBe("AT RISK"); // 60% exactly
    expect(metricStatus(300, 700, 400)).toBe("AT RISK");
  });

  it("is BEHIND below 60% of expected", () => {
    expect(metricStatus(100, 700, 400)).toBe("BEHIND");
    expect(metricStatus(0, 700, 400)).toBe("BEHIND");
  });
});
