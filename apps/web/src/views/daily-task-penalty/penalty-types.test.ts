import { describe, expect, it } from "vitest";

import { buildTaskPenaltyPolicy } from "./penalty-types";

describe("buildTaskPenaltyPolicy", () => {
  it("builds a default policy", () => {
    expect(buildTaskPenaltyPolicy("high", "default", 0)).toEqual({
      priority: "high",
      amountMode: "default",
    });
  });

  it("builds an override policy", () => {
    expect(buildTaskPenaltyPolicy("medium", "override", 125_000)).toEqual({
      priority: "medium",
      amountMode: "override",
      overrideAmountVnd: 125_000,
    });
  });

  it("clears a policy when priority is unset", () => {
    expect(buildTaskPenaltyPolicy(null, "override", 1)).toEqual({
      priority: null,
    });
  });
});
