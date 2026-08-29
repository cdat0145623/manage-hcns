import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./daily-task-penalty-statistics.tsx", import.meta.url),
  "utf8",
);

describe("daily task penalty statistics visual hierarchy", () => {
  it("renders penalized instances with a priority column and custom-penalty indicator", () => {
    expect(source).toContain("t`Độ ưu tiên`");
    expect(source).toContain("HiCurrencyDollar");
    expect(source).not.toContain("t`Nhân viên`");
  });

  it("uses three toggleable priority pills instead of an internal employee filter", () => {
    expect(source).toContain("setActivePriority");
    expect(source).toContain("priorityFilters");
    expect(source).not.toContain("selectedCell");
  });

  it("explains that the indicator marks a custom deduction", () => {
    expect(source).toContain("t`Mức khấu trừ riêng cho task này");
    expect(source).toContain("t`task bị khấu trừ`");
  });
});
