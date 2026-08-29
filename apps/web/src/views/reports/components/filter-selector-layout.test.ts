import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reportsViewSource = readFileSync(
  new URL("../ReportsView.tsx", import.meta.url),
  "utf8",
);

describe("report filter selector layout", () => {
  it("keeps the selector width stable on desktop and fluid on mobile", () => {
    expect(reportsViewSource).toMatch(/w-full[^\n]*shrink-0[^\n]*sm:w-56/);
  });

  it("keeps penalty statistics outside the performance chart selector", () => {
    expect(reportsViewSource).not.toMatch(/value: "penalty" as const/);

    const performanceSection = reportsViewSource.indexOf(
      'title="Chi tiết hiệu suất (công việc hằng ngày)"',
    );
    const penaltySection = reportsViewSource.indexOf(
      'title="Thống kê khấu trừ Daily Task"',
    );

    expect(performanceSection).toBeGreaterThan(-1);
    expect(penaltySection).toBeGreaterThan(performanceSection);
  });
});
