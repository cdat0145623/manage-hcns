import type { Locale } from "date-fns";
import { setHours, setMilliseconds, setMinutes, setSeconds } from "date-fns";
import {
  formatInTimeZone,
  fromZonedTime,
  toDate,
  toZonedTime,
} from "date-fns-tz";

/** Matches RRULE `tzid` in `generateRruleString`. */
export const CALENDAR_TIME_ZONE = "Asia/Ho_Chi_Minh";

/**
 * Parse a calendar day key (`yyyy-MM-dd`) as start-of-day in the app calendar zone.
 * Avoids `new Date("yyyy-MM-dd")` which is UTC midnight and shifts +7h vs VN.
 */
export function parseCalendarDayInZone(
  dateStr: string,
  timeZone: string = CALENDAR_TIME_ZONE,
): Date {
  return toDate(`${dateStr}T00:00:00.000`, { timeZone });
}

/**
 * On the calendar day of `anchorUtc` in `timeZone`, set wall-clock time from
 * `masterSampleUtc`'s time-of-day in the same zone (same semantics as the old
 * `setHours(master.getHours())` on the server, but independent of Node process TZ).
 */
export function applyMasterWallTimeToAnchorDay(
  anchorUtc: Date,
  masterSampleUtc: Date,
  timeZone: string = CALENDAR_TIME_ZONE,
): Date {
  const anchorZoned = toZonedTime(anchorUtc, timeZone);
  const masterZoned = toZonedTime(masterSampleUtc, timeZone);
  let merged = setHours(anchorZoned, masterZoned.getHours());
  merged = setMinutes(merged, masterZoned.getMinutes());
  merged = setSeconds(merged, masterZoned.getSeconds());
  merged = setMilliseconds(merged, masterZoned.getMilliseconds());
  return fromZonedTime(merged, timeZone);
}

/** Format an instant for display as wall time in the app calendar zone (UTC+7). */
export function formatInAppCalendarZone(
  date: Date | string | number,
  formatStr: string,
  options?: { locale?: Locale },
): string {
  return formatInTimeZone(date, CALENDAR_TIME_ZONE, formatStr, options);
}

export function calendarDateKeyInAppZone(date: Date | string | number): string {
  return formatInTimeZone(date, CALENDAR_TIME_ZONE, "yyyy-MM-dd");
}

/** Difference in calendar days (later − earlier) in the app zone. */
export function diffCalendarDaysInAppZone(
  later: Date | string | number,
  earlier: Date | string | number,
): number {
  const [y1, m1, d1] = calendarDateKeyInAppZone(later).split("-").map(Number);
  const [y2, m2, d2] = calendarDateKeyInAppZone(earlier).split("-").map(Number);
  const u1 = Date.UTC(y1!, m1! - 1, d1!);
  const u2 = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((u1 - u2) / 86400000);
}

/** True if `dueDate` falls on a calendar day before "today" in the app zone. */
export function isCalendarDueDateOverdueInAppZone(
  dueDate: Date | string | number,
  now: Date = new Date(),
): boolean {
  return calendarDateKeyInAppZone(dueDate) < calendarDateKeyInAppZone(now);
}

export function isSameCalendarYearInAppZone(
  date: Date | string | number,
  reference: Date = new Date(),
): boolean {
  return (
    formatInTimeZone(date, CALENDAR_TIME_ZONE, "yyyy") ===
    formatInTimeZone(reference, CALENDAR_TIME_ZONE, "yyyy")
  );
}

/**
 * From a calendar cell `dateObj` (midnight of chosen day in the browser) and HH:mm
 * wall time in {@link CALENDAR_TIME_ZONE}, returns the correct UTC instant for storage.
 */
export function buildInstantFromAppCalendarDayAndTime(
  dateObj: Date,
  timeStr: string,
  timeZone: string = CALENDAR_TIME_ZONE,
): Date {
  const dayKey = formatInTimeZone(dateObj, timeZone, "yyyy-MM-dd");
  const [hRaw, mRaw] = timeStr.split(":");
  const hours = parseInt(hRaw ?? "0", 10);
  const minutes = parseInt(mRaw ?? "0", 10);
  const wall = `${dayKey}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  return fromZonedTime(wall, timeZone);
}
