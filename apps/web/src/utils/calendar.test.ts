import { describe, expect, it } from "vitest";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import {
  calculateDayHourLayout,
  compareCalendarEntriesByTime,
} from "./calendar";

const createEntry = ({
  id,
  start,
  duration,
}: {
  id: string;
  start: string;
  duration: number;
}): CalendarEntry => {
  const date = new Date(start);

  return {
    id,
    masterId: `master-${id}`,
    title: id,
    description: "",
    assigneeName: "",
    date,
    startDate: date,
    endDate: new Date(date.getTime() + duration * 60_000),
    color: "#2563eb",
    duration,
    type: "INSTANCE",
    recurrence: "NONE",
    rruleString: "",
    checklists: [],
  };
};

describe("compareCalendarEntriesByTime", () => {
  it("sorts by start time, then by end time", () => {
    const entries = [
      createEntry({
        id: "task-2",
        start: "2026-08-13T08:30:00+07:00",
        duration: 30,
      }),
      createEntry({
        id: "task-3",
        start: "2026-08-13T08:00:00+07:00",
        duration: 60,
      }),
      createEntry({
        id: "task-1",
        start: "2026-08-13T08:00:00+07:00",
        duration: 30,
      }),
    ];

    expect(
      entries.sort(compareCalendarEntriesByTime).map((entry) => entry.id),
    ).toEqual(["task-1", "task-3", "task-2"]);
  });
});

describe("calculateDayHourLayout", () => {
  it("expands an hour to contain every task that starts within it", () => {
    const entries = [
      createEntry({
        id: "task-1",
        start: "2026-08-13T08:00:00+07:00",
        duration: 30,
      }),
      createEntry({
        id: "task-3",
        start: "2026-08-13T08:00:00+07:00",
        duration: 60,
      }),
      createEntry({
        id: "task-2",
        start: "2026-08-13T08:30:00+07:00",
        duration: 30,
      }),
    ];

    const layout = calculateDayHourLayout(entries, 8);
    const eightOClock = layout.find(({ hour }) => hour === 8);
    const nineOClock = layout.find(({ hour }) => hour === 9);

    expect(eightOClock?.entries.map((entry) => entry.id)).toEqual([
      "task-1",
      "task-3",
      "task-2",
    ]);
    expect(eightOClock?.height).toBeGreaterThan(128);
    expect(nineOClock?.top).toBe(eightOClock?.height);
  });
});
