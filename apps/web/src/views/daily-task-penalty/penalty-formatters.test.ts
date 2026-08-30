import { describe, expect, it } from "vitest";
import { formatPenaltyVnd, penaltyPriorityLabel } from "./penalty-formatters";

describe("penalty formatters", () => {
  it("formats zero VND without decimals", () => {
    expect(formatPenaltyVnd(0)).toContain("0");
    expect(formatPenaltyVnd(0)).toContain("₫");
  });

  it("keeps the Vietnamese priority labels", () => {
    expect(penaltyPriorityLabel("high")).toBe("Cao");
    expect(penaltyPriorityLabel("medium")).toBe("Trung bình");
    expect(penaltyPriorityLabel("low")).toBe("Thấp");
  });
});
