import {
  calendarDateKeyInAppZone,
  formatInAppCalendarZone,
  parseCalendarDayInZone,
} from "@kan/shared/utils";

import type { CalendarEntry } from "~/hooks/useRecurrence";

export const getCalendarHour = (date: Date | string | number): number =>
  Number(formatInAppCalendarZone(date, "H"));

export const getCalendarMinute = (date: Date | string | number): number =>
  Number(formatInAppCalendarZone(date, "m"));

export const isSameAppCalendarDay = (
  first: Date | string | number,
  second: Date | string | number,
): boolean =>
  calendarDateKeyInAppZone(first) === calendarDateKeyInAppZone(second);

const appCalendarDateFromUtcParts = (
  year: number,
  monthIndex: number,
  day: number,
): Date => {
  const key = new Date(Date.UTC(year, monthIndex, day))
    .toISOString()
    .slice(0, 10);
  return parseCalendarDayInZone(key);
};

export const addAppCalendarDays = (
  date: Date | string | number,
  amount: number,
): Date => {
  const [year = 0, month = 0, day = 0] = calendarDateKeyInAppZone(date)
    .split("-")
    .map(Number);
  return appCalendarDateFromUtcParts(year, month - 1, day + amount);
};

export const addAppCalendarMonths = (
  date: Date | string | number,
  amount: number,
): Date => {
  const [year = 0, month = 0, day = 0] = calendarDateKeyInAppZone(date)
    .split("-")
    .map(Number);
  const monthAnchor = new Date(Date.UTC(year, month - 1 + amount, 1));
  const targetYear = monthAnchor.getUTCFullYear();
  const targetMonth = monthAnchor.getUTCMonth();
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  return appCalendarDateFromUtcParts(
    targetYear,
    targetMonth,
    Math.min(day, lastDay),
  );
};

export const getAppCalendarMonthRange = (
  date: Date | string | number,
): { from: Date; to: Date } => {
  const [year = 0, month = 0] = calendarDateKeyInAppZone(date)
    .split("-")
    .map(Number);
  const from = appCalendarDateFromUtcParts(year, month - 1, 1);
  const nextMonth = appCalendarDateFromUtcParts(year, month, 1);
  return { from, to: new Date(nextMonth.getTime() - 1) };
};

export const getAppCalendarWeekDays = (
  date: Date | string | number,
): Date[] => {
  const isoWeekday = Number(formatInAppCalendarZone(date, "i"));
  const monday = addAppCalendarDays(date, 1 - isoWeekday);
  return Array.from({ length: 7 }, (_, index) =>
    addAppCalendarDays(monday, index),
  );
};

export const getAppCalendarMonthGridDays = (
  date: Date | string | number,
): Date[] => {
  const { from: monthStart } = getAppCalendarMonthRange(date);
  const isoWeekday = Number(formatInAppCalendarZone(monthStart, "i"));
  const gridStart = addAppCalendarDays(monthStart, 1 - isoWeekday);
  return Array.from({ length: 42 }, (_, index) =>
    addAppCalendarDays(gridStart, index),
  );
};

export const isSameAppCalendarMonth = (
  first: Date | string | number,
  second: Date | string | number,
): boolean =>
  formatInAppCalendarZone(first, "yyyy-MM") ===
  formatInAppCalendarZone(second, "yyyy-MM");

export function formatCalendarDeadline(deadline: Date, taskDate: Date): string {
  if (!isSameAppCalendarDay(deadline, taskDate)) {
    const sameYear =
      formatInAppCalendarZone(deadline, "yyyy") ===
      formatInAppCalendarZone(taskDate, "yyyy");
    return formatInAppCalendarZone(
      deadline,
      sameYear ? "dd/MM, HH:mm" : "dd/MM/yyyy, HH:mm",
    );
  }

  return formatInAppCalendarZone(deadline, "HH:mm");
}

export function getCalendarTaskDuration(
  startDate: Date,
  currentEndDate: Date,
  originalEndDate?: Date,
): number {
  const displayEndDate = originalEndDate ?? currentEndDate;
  const duration = Math.floor(
    (displayEndDate.getTime() - startDate.getTime()) / 60_000,
  );
  return Number.isFinite(duration) && duration >= 0 ? duration : 60;
}

export interface OverlapInfo {
  totalOverlap: number;
  overlapIndex: number;
}

export function compareCalendarEntriesByTime(
  a: CalendarEntry,
  b: CalendarEntry,
): number {
  const aStart = new Date(a.date).getTime();
  const bStart = new Date(b.date).getTime();

  if (aStart !== bStart) return aStart - bStart;

  const aEnd = new Date(a.endDate).getTime();
  const bEnd = new Date(b.endDate).getTime();

  return aEnd - bEnd;
}

const HOUR_MIN_HEIGHT = 128;
const STACKED_TASK_HEIGHT = 80;
const STACKED_TASK_GAP = 4;
const HOUR_PADDING = 8;

export interface CalendarHourLayout {
  hour: number;
  top: number;
  height: number;
}

export interface DayHourLayout extends CalendarHourLayout {
  entries: CalendarEntry[];
}

function calculateHourHeight(entryCount: number): number {
  const contentHeight =
    entryCount * STACKED_TASK_HEIGHT +
    Math.max(entryCount - 1, 0) * STACKED_TASK_GAP +
    HOUR_PADDING;

  return Math.max(HOUR_MIN_HEIGHT, contentHeight);
}

export function getCurrentTimeTop(
  hourLayout: CalendarHourLayout[],
  currentTime: Date,
): number | null {
  const currentHourLayout = hourLayout.find(
    ({ hour }) => hour === getCalendarHour(currentTime),
  );

  if (!currentHourLayout) return null;

  return (
    currentHourLayout.top +
    (getCalendarMinute(currentTime) * currentHourLayout.height) / 60
  );
}

export function calculateDayHourLayout(
  entries: CalendarEntry[],
  startHour: number,
): DayHourLayout[] {
  const sortedEntries = [...entries].sort(compareCalendarEntriesByTime);
  let top = 0;

  return Array.from({ length: 24 - startHour }, (_, index) => {
    const hour = startHour + index;
    const hourEntries = sortedEntries.filter(
      (entry) => getCalendarHour(entry.date) === hour,
    );
    const height = calculateHourHeight(hourEntries.length);
    const layout = { hour, top, height, entries: hourEntries };

    top += height;
    return layout;
  });
}

export function calculateWeekHourLayout(
  entriesByDay: CalendarEntry[][],
  startHour: number,
): CalendarHourLayout[] {
  let top = 0;

  return Array.from({ length: 24 - startHour }, (_, index) => {
    const hour = startHour + index;
    const busiestDayEntryCount = entriesByDay.reduce((maxCount, dayEntries) => {
      const entryCount = dayEntries.reduce(
        (count, entry) =>
          getCalendarHour(entry.date) === hour ? count + 1 : count,
        0,
      );

      return Math.max(maxCount, entryCount);
    }, 0);
    const height = calculateHourHeight(busiestDayEntryCount);
    const layout = { hour, top, height };

    top += height;
    return layout;
  });
}

export function calculateOverlap(
  entries: CalendarEntry[],
): Map<string, OverlapInfo> {
  const sorted = [...entries].sort((a, b) => {
    const aDate = new Date(a.date).getTime();
    const bDate = new Date(b.date).getTime();
    if (aDate !== bDate) return aDate - bDate;
    return (a.duration || 0) - (b.duration || 0);
  });

  const results = new Map<string, OverlapInfo>();
  const clusters: CalendarEntry[][] = [];

  // Group into clusters of overlapping events
  sorted.forEach((entry) => {
    let placed = false;
    const entryStart = new Date(entry.date).getTime();

    for (const cluster of clusters) {
      const clusterEnd = Math.max(
        ...cluster.map(
          (e) => new Date(e.date).getTime() + (e.duration || 60) * 60000,
        ),
      );

      if (entryStart < clusterEnd) {
        cluster.push(entry);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push([entry]);
    }
  });

  clusters.forEach((cluster) => {
    const lanes: number[][] = [];

    cluster.forEach((entry) => {
      const start = new Date(entry.date).getTime();
      const end = start + (entry.duration || 60) * 60000;

      let laneIndex = lanes.findIndex((lane) => {
        const lastEnd = lane[lane.length - 1];
        return lastEnd === undefined || start >= lastEnd;
      });

      if (laneIndex === -1) {
        laneIndex = lanes.length;
        lanes.push([end]);
      } else {
        lanes[laneIndex]?.push(end);
      }

      results.set(entry.id, {
        overlapIndex: laneIndex,
        totalOverlap: 0, // Will update in next pass
      });
    });

    // Update totalOverlap for all entries in cluster to be the max number of lanes
    cluster.forEach((entry) => {
      const info = results.get(entry.id);
      if (info) {
        info.totalOverlap = lanes.length;
      }
    });
  });

  return results;
}
