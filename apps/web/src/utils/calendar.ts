import type { CalendarEntry } from "~/hooks/useRecurrence";

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
const STACKED_TASK_HEIGHT = 56;
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
    ({ hour }) => hour === currentTime.getHours(),
  );

  if (!currentHourLayout) return null;

  return (
    currentHourLayout.top +
    (currentTime.getMinutes() * currentHourLayout.height) / 60
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
      (entry) => new Date(entry.date).getHours() === hour,
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
          new Date(entry.date).getHours() === hour ? count + 1 : count,
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
