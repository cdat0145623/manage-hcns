import type { CalendarEntry } from "~/hooks/useRecurrence";

export interface OverlapInfo {
  totalOverlap: number;
  overlapIndex: number;
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
