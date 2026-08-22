import {
  buildInstantFromAppCalendarDayAndTime,
  calendarDateKeyInAppZone,
} from "@kan/shared/utils";

import type { RecurrenceType } from "~/hooks/useRecurrence";

export const buildCalendarEventSchedule = (
  calendarDay: Date,
  startTime: string,
  endTime: string,
): { startDate: Date; endDate: Date } => {
  const startDate = buildInstantFromAppCalendarDayAndTime(
    calendarDay,
    startTime,
  );
  let endDate = buildInstantFromAppCalendarDayAndTime(calendarDay, endTime);

  if (endDate <= startDate) {
    endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
  }

  return { startDate, endDate };
};

export const getCalendarEffectiveDate = (
  occurrenceDate: Date | string,
): string => calendarDateKeyInAppZone(occurrenceDate);

export const inferCalendarRecurrenceType = (
  rruleString: string,
): RecurrenceType => {
  const normalized = rruleString.replace(/\\n/g, "\n").toUpperCase();
  if (normalized.includes("FREQ=DAILY")) return "DAILY";
  if (normalized.includes("FREQ=WEEKLY")) {
    const weekdays = /BYDAY=([^;\n]+)/.exec(normalized)?.[1]?.split(",") ?? [];
    return weekdays.length > 1 ? "CUSTOM" : "WEEKLY";
  }
  if (normalized.includes("FREQ=MONTHLY")) {
    return normalized.includes("BYMONTHDAY=") ? "MONTHLY_DATE" : "MONTHLY_DAY";
  }
  return "NONE";
};
