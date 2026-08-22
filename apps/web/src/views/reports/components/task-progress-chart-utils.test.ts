import { describe, expect, it } from "vitest";

import {
  getTaskNameAxisWidth,
  getTaskProgressChartHeight,
  getTaskProgressLabel,
  splitTaskName,
} from "./task-progress-chart-utils";

describe("getTaskProgressLabel", () => {
  it("formats a non-zero segment as count and rounded percentage", () => {
    expect(getTaskProgressLabel(4, 16.4)).toBe("4 (16%)");
  });

  it("hides labels for empty segments", () => {
    expect(getTaskProgressLabel(0, 0)).toBe("");
  });
});

describe("getTaskProgressChartHeight", () => {
  it("keeps a readable minimum height for a short task list", () => {
    expect(getTaskProgressChartHeight(3)).toBe(320);
  });

  it("adds one row of space for every task in a long task list", () => {
    expect(getTaskProgressChartHeight(20)).toBe(1520);
  });
});

describe("splitTaskName", () => {
  it("wraps a long task name into at most two readable lines", () => {
    expect(
      splitTaskName("Kiểm tra hợp đồng và hồ sơ đính kèm quá hạn", 24),
    ).toEqual(["Kiểm tra hợp đồng và hồ", "sơ đính kèm quá hạn"]);
  });

  it("adds an ellipsis when the task name exceeds two lines", () => {
    expect(
      splitTaskName(
        "Kiểm tra hợp đồng và hồ sơ đính kèm quá hạn cần xử lý ngay hôm nay",
        24,
      ),
    ).toEqual(["Kiểm tra hợp đồng và hồ", "sơ đính kèm quá hạn cần…"]);
  });

  it("wraps and truncates a long task name without spaces", () => {
    expect(splitTaskName("Côngviệccótênrấtdàikhôngcókhoảngtrắng", 10)).toEqual([
      "Côngviệccó",
      "tênrấtdài…",
    ]);
  });
});

describe("getTaskNameAxisWidth", () => {
  it("preserves useful plot space on a narrow chart", () => {
    const chartWidth = 320;
    const chartHorizontalMargins = 32;

    expect(
      chartWidth - getTaskNameAxisWidth(chartWidth) - chartHorizontalMargins,
    ).toBeGreaterThanOrEqual(150);
  });

  it("allows wider task labels when the chart has enough space", () => {
    expect(getTaskNameAxisWidth(1000)).toBe(250);
  });
});
