/**
 * Weekly Operating Board — pure date/status helpers for the Mon–Sun operating
 * week, anchored to a timezone (default Asia/Kolkata). No AI, projection only.
 *
 * "Date-only" values in this module (weekStartMonday's return, shiftWeek,
 * dayIndexInWeek's weekStart argument) are represented as UTC-midnight Date
 * objects whose Y/M/D correspond to the local calendar date in `timeZone` —
 * the same convention used elsewhere in this codebase for date-only values
 * (see `new Date().toISOString().slice(0, 10)`).
 */

export const DEFAULT_OPERATING_TIMEZONE = "Asia/Kolkata";

export type MetricStatus = "ON TRACK" | "AT RISK" | "BEHIND" | "DONE";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Offset (minutes) such that `local = utc + offset`, computed for the instant `date` in `timeZone`. */
function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Calendar-date parts (y/m/d) of `date` as observed in `timeZone`. */
function zonedDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/** Date-only UTC-midnight Date for a given calendar date (Y/M/D). */
function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * The Monday (date-only) that starts the operating week containing `date`,
 * computed against the given IANA timezone (fixed offset for Asia/Kolkata).
 */
export function weekStartMonday(date: Date, timeZone: string = DEFAULT_OPERATING_TIMEZONE): Date {
  const { year, month, day } = zonedDateParts(date, timeZone);
  const local = dateOnly(year, month, day);
  const dow = local.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon->0 .. Sun->6
  return new Date(local.getTime() - daysSinceMonday * MS_PER_DAY);
}

/** Real UTC instant of local midnight on a date-only calendar date, in `timeZone`. */
function zonedMidnightInstant(dateOnlyValue: Date, timeZone: string): Date {
  const guessMs = dateOnlyValue.getTime();
  const offsetMinutes = timeZoneOffsetMinutes(new Date(guessMs), timeZone);
  return new Date(guessMs - offsetMinutes * 60_000);
}

export interface WeekRange {
  /** Actual UTC instant of Monday 00:00 in the operating timezone. */
  start: Date;
  /** Actual UTC instant of the following Monday 00:00 (exclusive upper bound). */
  endExclusive: Date;
  /** Human label, e.g. "11 Aug – 17 Aug 2026". */
  label: string;
}

/** Real start/end instants (and a display label) for the week starting on `weekStart` (Monday, date-only). */
export function weekRange(
  weekStart: Date,
  timeZone: string = DEFAULT_OPERATING_TIMEZONE,
): WeekRange {
  const start = zonedMidnightInstant(weekStart, timeZone);
  const endExclusiveDateOnly = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
  const endExclusive = zonedMidnightInstant(endExclusiveDateOnly, timeZone);
  const sunday = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
  const label = `${formatDayMonth(weekStart)} – ${formatDayMonth(sunday)} ${sunday.getUTCFullYear()}`;
  return { start, endExclusive, label };
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDayMonth(dateOnlyValue: Date): string {
  return `${dateOnlyValue.getUTCDate()} ${MONTH_LABELS[dateOnlyValue.getUTCMonth()]}`;
}

/** Shift a date-only Monday by `deltaWeeks` (may be negative). */
export function shiftWeek(weekStart: Date, deltaWeeks: number): Date {
  return new Date(weekStart.getTime() + deltaWeeks * 7 * MS_PER_DAY);
}

/** YYYY-MM-DD for a date-only value. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Day index (0=Mon..6=Sun) of `now` relative to `weekStart`, both compared as
 * calendar dates in `timeZone`. Not clamped — negative for a future week,
 * >6 for a fully-elapsed past week.
 */
export function dayIndexInWeek(
  now: Date,
  weekStart: Date,
  timeZone: string = DEFAULT_OPERATING_TIMEZONE,
): number {
  const { year, month, day } = zonedDateParts(now, timeZone);
  const nowDateOnly = dateOnly(year, month, day);
  return Math.round((nowDateOnly.getTime() - weekStart.getTime()) / MS_PER_DAY);
}

/**
 * Expected week-to-date value against a per-day target.
 * `dayIndexMon0` follows `dayIndexInWeek`'s convention: 0..6 for the current
 * week (elapsed days = index + 1), <0 for a future week (0 expected), and
 * >=7 for a fully-elapsed past week (full 7 days expected).
 */
export function expectedWtd(dailyTarget: number, dayIndexMon0: number): number {
  if (dayIndexMon0 < 0) return 0;
  const daysElapsed = Math.min(dayIndexMon0 + 1, 7);
  return dailyTarget * daysElapsed;
}

/**
 * Status of a metric against its target and week-to-date expectation.
 * DONE when actual already meets the (weekly) target, regardless of pacing.
 */
export function metricStatus(
  actual: number,
  target: number,
  expectedByNow: number,
): MetricStatus {
  if (actual >= target) return "DONE";
  if (actual >= expectedByNow * 0.9) return "ON TRACK";
  if (actual >= expectedByNow * 0.6) return "AT RISK";
  return "BEHIND";
}
