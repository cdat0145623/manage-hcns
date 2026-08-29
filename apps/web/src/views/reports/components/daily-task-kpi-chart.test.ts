import { describe, expect, it } from "vitest";

import {
  getDailyTaskKpiChartHeight,
  truncateDailyTaskKpiLabel,
} from "./daily-task-kpi-chart-utils";

describe("daily task KPI chart layout", () => {
  it("keeps a compact minimum height and grows with task rows", () => {
    expect(getDailyTaskKpiChartHeight(0)).toBe(320);
    expect(getDailyTaskKpiChartHeight(5)).toBe(320);
    expect(getDailyTaskKpiChartHeight(10)).toBe(472);
  });

  it("truncates long task labels without changing the source name", () => {
    expect(truncateDailyTaskKpiLabel("task ngắn")).toBe("task ngắn");
    expect(
      truncateDailyTaskKpiLabel(
        "Kiểm tra, rà soát và đối chiếu toàn bộ chứng từ thanh toán khách hàng",
      ),
    ).toBe("Kiểm tra, rà soát và đối chiếu to…");
  });
});
