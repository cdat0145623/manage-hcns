import { describe, expect, it } from "vitest";

import {
  buildLocalDailyTaskSeedPlan,
  LOCAL_TEST_TASK_NAMES,
  LOCAL_TEST_WEEKDAYS,
} from "./localTaskSchedulerTest.repo";

describe("buildLocalDailyTaskSeedPlan", () => {
  it("distributes 20 tasks from Monday through Saturday", () => {
    const plan = buildLocalDailyTaskSeedPlan({
      count: 20,
      userIds: ["user-1", "user-2"],
      startDate: "2026-08-24",
      endDate: "2026-09-07",
      startTime: "08:00",
      endTime: "17:30",
      batchId: "batch-1",
    });

    expect(plan).toHaveLength(20);
    expect(new Set(plan.map((item) => item.name)).size).toBe(20);
    expect(plan.map((item) => item.name)).toEqual(
      LOCAL_TEST_TASK_NAMES.map(
        (name) => `[LOCAL-SCHEDULER-TEST:batch-1] ${name}`,
      ),
    );
    expect(plan.map((item) => item.userId)).toEqual([
      "user-1",
      "user-2",
      "user-1",
      "user-2",
      "user-1",
      "user-2",
      "user-1",
      "user-2",
      "user-1",
      "user-2",
      "user-1",
      "user-2",
      "user-1",
      "user-2",
      "user-1",
      "user-2",
      "user-1",
      "user-2",
      "user-1",
      "user-2",
    ]);
    expect(plan.map((item) => item.rruleString)).toEqual([
      ...LOCAL_TEST_WEEKDAYS.flatMap((weekday) =>
        Array.from(
          { length: weekday.count },
          () => `FREQ=WEEKLY;BYDAY=${weekday.code}`,
        ),
      ),
    ]);
    expect(plan.every((item) => item.description === "batch-1")).toBe(true);
    expect(plan.every((item) => item.startDate < item.endDate)).toBe(true);
  });

  it("rejects invalid seed ranges and empty assignee lists", () => {
    expect(() =>
      buildLocalDailyTaskSeedPlan({
        count: 20,
        userIds: [],
        startDate: "2026-08-24",
        endDate: "2026-09-07",
        startTime: "08:00",
        endTime: "17:30",
        batchId: "batch-1",
      }),
    ).toThrow("At least one user is required");

    expect(() =>
      buildLocalDailyTaskSeedPlan({
        count: 20,
        userIds: ["user-1"],
        startDate: "2026-09-07",
        endDate: "2026-08-24",
        startTime: "08:00",
        endTime: "17:30",
        batchId: "batch-1",
      }),
    ).toThrow("startDate must be before endDate");
  });
});
