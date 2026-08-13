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

const DAY_HOUR_MIN_HEIGHT = 128;
const DAY_TASK_HEIGHT = 56;
const DAY_TASK_GAP = 4;
const DAY_HOUR_PADDING = 8;

export interface DayHourLayout {
  hour: number;
  top: number;
  height: number;
  entries: CalendarEntry[];
}

export function getCurrentTimeTop(
  hourLayout: DayHourLayout[],
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
    const contentHeight =
      hourEntries.length * DAY_TASK_HEIGHT +
      Math.max(hourEntries.length - 1, 0) * DAY_TASK_GAP +
      DAY_HOUR_PADDING;
    const height = Math.max(DAY_HOUR_MIN_HEIGHT, contentHeight);
    const layout = { hour, top, height, entries: hourEntries };

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
