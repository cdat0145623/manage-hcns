import { describe, expect, it } from "vitest";

import {
  calculateDailyTaskKpi,
  filterDailyTaskEntries,
  getDailyTaskOccurrenceKey,
  getDailyTaskPeriodBounds,
  getVisibleDailyTaskSelectionState,
  normalizeDailyTaskKpiEntries,
} from "./daily-task-kpi-utils";

const entries = [
  {
    id: "instance-1",
    taskMasterId: "master-1",
    name: "Hoàn thành báo cáo",
    targetDate: new Date("2026-08-05T09:00:00.000Z"),
    status: "done" as const,
    penaltyPriority: null,
  },
  {
    id: "instance-2",
    taskMasterId: "master-2",
    name: "Daily standup",
    targetDate: new Date("2026-08-06T09:00:00.000Z"),
    status: "pending" as const,
    penaltyPriority: null,
  },
  {
    id: "instance-3",
    taskMasterId: "master-3",
    name: "Đọc tài liệu",
    targetDate: new Date("2026-08-07T09:00:00.000Z"),
    status: "missed" as const,
    penaltyPriority: null,
  },
];

describe("getDailyTaskPeriodBounds", () => {
  it("returns the first and last day of the selected month", () => {
    const bounds = getDailyTaskPeriodBounds(new Date("2026-08-20T12:00:00Z"));

    expect(bounds.from.getDate()).toBe(1);
    expect(bounds.to.getDate()).toBe(31);
  });
});

describe("getDailyTaskOccurrenceKey", () => {
  it("uses the app calendar day instead of the UTC day", () => {
    expect(
      getDailyTaskOccurrenceKey({
        taskMasterId: "master-1",
        targetDate: new Date("2026-08-16T17:00:00.000Z"),
      }),
    ).toBe("master-1:2026-08-17");
  });
});

describe("filterDailyTaskEntries", () => {
  it("uses targetDate and includes both range boundaries", () => {
    const result = filterDailyTaskEntries(
      entries,
      new Date("2026-08-06T00:00:00.000Z"),
      new Date("2026-08-07T23:59:59.999Z"),
    );

    expect(result.map((entry) => entry.id)).toEqual([
      "instance-2",
      "instance-3",
    ]);
  });
});

describe("normalizeDailyTaskKpiEntries", () => {
  it("normalizes the penalty label for each task occurrence", () => {
    expect(
      normalizeDailyTaskKpiEntries([
        {
          id: "instance-1",
          taskMasterId: "master-1",
          targetDate: new Date("2026-08-05T09:00:00.000Z"),
          status: "done",
          penalty: { priority: "medium" },
        },
      ]),
    ).toEqual([
      expect.objectContaining({ id: "instance-1", penaltyPriority: "medium" }),
    ]);
  });

  it("keeps a task occurrence whose targetDate was deserialized as a Date", () => {
    const targetDate = new Date("2026-08-05T09:00:00.000Z");

    expect(
      normalizeDailyTaskKpiEntries([
        {
          id: "instance-1",
          taskMasterId: "master-1",
          taskMaster: { name: "Hoàn thành báo cáo" },
          targetDate,
          status: "done",
        },
      ]),
    ).toEqual([
      {
        id: "instance-1",
        taskMasterId: "master-1",
        name: "Hoàn thành báo cáo",
        targetDate,
        status: "done",
        penaltyPriority: null,
      },
    ]);
  });
});

describe("calculateDailyTaskKpi", () => {
  it("does not include pending tasks in the KPI denominator", () => {
    expect(calculateDailyTaskKpi(entries, new Set()).completionRate).toBe(50);
  });

  it("counts only included done tasks in the numerator", () => {
    const completedEntry = entries[0];
    if (!completedEntry) throw new Error("Expected completed task entry");
    const excluded = new Set([getDailyTaskOccurrenceKey(completedEntry)]);

    expect(calculateDailyTaskKpi(entries, excluded)).toEqual({
      total: 2,
      done: 0,
      pending: 1,
      missed: 1,
      excluded: 1,
      completionRate: 0,
    });
  });

  it("returns zero instead of NaN when there are no included tasks", () => {
    expect(calculateDailyTaskKpi([], new Set())).toEqual({
      total: 0,
      done: 0,
      pending: 0,
      missed: 0,
      excluded: 0,
      completionRate: 0,
    });
  });
});

describe("getVisibleDailyTaskSelectionState", () => {
  it("reports checked, unchecked, and indeterminate states for visible task selections", () => {
    const pendingEntry = entries[1];
    if (!pendingEntry) throw new Error("Expected pending task entry");
    const excluded = new Set([getDailyTaskOccurrenceKey(pendingEntry)]);

    expect(getVisibleDailyTaskSelectionState(entries, new Set())).toEqual({
      allIncluded: true,
      someIncluded: true,
    });
    expect(
      getVisibleDailyTaskSelectionState(
        entries,
        new Set(entries.map(getDailyTaskOccurrenceKey)),
      ),
    ).toEqual({
      allIncluded: false,
      someIncluded: false,
    });
    expect(getVisibleDailyTaskSelectionState(entries, excluded)).toEqual({
      allIncluded: false,
      someIncluded: true,
    });
  });
});
