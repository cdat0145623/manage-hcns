import { describe, expect, it } from "vitest";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import {
  calculateDayHourLayout,
  calculateWeekHourLayout,
  compareCalendarEntriesByTime,
  getCurrentTimeTop,
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

  it("uses the actual end time when zero-duration entries start together", () => {
    const zeroDuration = createEntry({
      id: "zero-duration",
      start: "2026-08-13T08:00:00+07:00",
      duration: 0,
    });
    const thirtyMinutes = createEntry({
      id: "thirty-minutes",
      start: "2026-08-13T08:00:00+07:00",
      duration: 30,
    });

    expect(
      [thirtyMinutes, zeroDuration]
        .sort(compareCalendarEntriesByTime)
        .map((entry) => entry.id),
    ).toEqual(["zero-duration", "thirty-minutes"]);
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

describe("calculateWeekHourLayout", () => {
  it("uses the busiest day to size the shared hour row", () => {
    const mondayEntries = [
      createEntry({
        id: "monday-task",
        start: "2026-08-10T08:00:00+07:00",
        duration: 30,
      }),
    ];
    const tuesdayEntries = [
      createEntry({
        id: "tuesday-task-1",
        start: "2026-08-11T08:00:00+07:00",
        duration: 20,
      }),
      createEntry({
        id: "tuesday-task-2",
        start: "2026-08-11T08:20:00+07:00",
        duration: 20,
      }),
      createEntry({
        id: "tuesday-task-3",
        start: "2026-08-11T08:40:00+07:00",
        duration: 20,
      }),
    ];
    const wednesdayEntries = [
      createEntry({
        id: "wednesday-task-1",
        start: "2026-08-12T08:00:00+07:00",
        duration: 30,
      }),
      createEntry({
        id: "wednesday-task-2",
        start: "2026-08-12T08:30:00+07:00",
        duration: 30,
      }),
    ];

    const layout = calculateWeekHourLayout(
      [mondayEntries, tuesdayEntries, wednesdayEntries],
      8,
    );
    const eightOClock = layout.find(({ hour }) => hour === 8);
    const nineOClock = layout.find(({ hour }) => hour === 9);

    expect(eightOClock?.height).toBe(184);
    expect(nineOClock?.top).toBe(184);
  });

  it("keeps the minimum height when no day has more than two tasks", () => {
    const entries = [
      createEntry({
        id: "task-1",
        start: "2026-08-10T08:00:00+07:00",
        duration: 30,
      }),
      createEntry({
        id: "task-2",
        start: "2026-08-10T08:30:00+07:00",
        duration: 30,
      }),
    ];

    const layout = calculateWeekHourLayout([entries, []], 8);

    expect(layout[0]?.height).toBe(128);
    expect(layout[1]?.top).toBe(128);
  });

  it("positions the current time inside an expanded shared hour", () => {
    const entries = [
      createEntry({
        id: "task-1",
        start: "2026-08-10T08:00:00+07:00",
        duration: 20,
      }),
      createEntry({
        id: "task-2",
        start: "2026-08-10T08:20:00+07:00",
        duration: 20,
      }),
      createEntry({
        id: "task-3",
        start: "2026-08-10T08:40:00+07:00",
        duration: 20,
      }),
    ];
    const layout = calculateWeekHourLayout([entries], 8);

    expect(
      getCurrentTimeTop(layout, new Date("2026-08-10T08:30:00+07:00")),
    ).toBe(92);
  });
});

describe("getCurrentTimeTop", () => {
  it("returns null when the current hour is outside the rendered layout", () => {
    const layout = calculateDayHourLayout([], 8);
    const beforeStartHour = new Date("2026-08-13T07:30:00+07:00");

    expect(getCurrentTimeTop(layout, beforeStartHour)).toBeNull();
  });

  it("positions the current time within an expanded hour", () => {
    const entries = [
      createEntry({
        id: "task-1",
        start: "2026-08-13T08:00:00+07:00",
        duration: 30,
      }),
      createEntry({
        id: "task-2",
        start: "2026-08-13T08:15:00+07:00",
        duration: 30,
      }),
      createEntry({
        id: "task-3",
        start: "2026-08-13T08:30:00+07:00",
        duration: 30,
      }),
    ];
    const layout = calculateDayHourLayout(entries, 8);
    const eightThirty = new Date("2026-08-13T08:30:00+07:00");

    expect(getCurrentTimeTop(layout, eightThirty)).toBe(
      (layout[0]?.height ?? 0) / 2,
    );
  });
});
