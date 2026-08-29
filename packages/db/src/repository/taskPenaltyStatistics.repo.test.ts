import { describe, expect, it } from "vitest";

import { groupDailyTaskPenaltyRows } from "./taskPenaltyStatistics.repo";

describe("groupDailyTaskPenaltyRows", () => {
  it("returns penalty instances with their actual amount and an overall total", () => {
    const result = groupDailyTaskPenaltyRows([
      {
        taskMasterPublicId: "master-high",
        taskName: "Báo cáo ngày",
        taskMasterName: "Báo cáo ngày",
        targetDate: new Date("2026-08-05T01:00:00.000Z"),
        createdAt: new Date("2026-08-05T01:00:00.000Z"),
        priority: "high",
        source: "global_policy",
        amountVnd: 100_000,
      },
      {
        taskMasterPublicId: "master-low",
        taskName: "Theo dõi phản hồi",
        taskMasterName: "Theo dõi phản hồi",
        targetDate: new Date("2026-08-06T01:00:00.000Z"),
        createdAt: new Date("2026-08-06T01:00:00.000Z"),
        priority: "low",
        source: "master_override",
        amountVnd: 200_000,
      },
    ]);

    expect(result.entries).toEqual([
      expect.objectContaining({
        taskName: "Báo cáo ngày",
        priority: "high",
        source: "common",
        amountVnd: 100_000,
      }),
      expect.objectContaining({
        taskName: "Theo dõi phản hồi",
        priority: "low",
        source: "custom",
        amountVnd: 200_000,
      }),
    ]);
    expect(result.total).toEqual({ count: 2, amountVnd: 300_000 });
  });

  it("falls back to the master name for an older instance without a name snapshot", () => {
    const result = groupDailyTaskPenaltyRows([
      {
        taskMasterPublicId: "master-daily-check",
        taskName: null,
        taskMasterName: "Kiểm tra công việc hằng ngày",
        targetDate: new Date("2026-08-17T01:00:00.000Z"),
        createdAt: new Date("2026-08-17T01:00:00.000Z"),
        priority: "low",
        source: "system_default",
        amountVnd: 50_000,
      },
    ]);

    expect(result.entries[0]?.taskName).toBe("Kiểm tra công việc hằng ngày");
  });

  it("ignores rows without an assessable date or supported priority", () => {
    const result = groupDailyTaskPenaltyRows([
      {
        taskMasterPublicId: null,
        taskName: "No label",
        taskMasterName: null,
        targetDate: null,
        createdAt: new Date("2026-08-05T01:00:00.000Z"),
        priority: null,
        source: "global_policy",
        amountVnd: 100_000,
      },
    ]);

    expect(result).toEqual({ entries: [], total: { count: 0, amountVnd: 0 } });
  });
});
