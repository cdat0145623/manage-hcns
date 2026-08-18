import { describe, expect, it } from "vitest";

import { shouldStartTaskInstanceScheduler } from "./instrumentation";

describe("shouldStartTaskInstanceScheduler", () => {
  it("starts only in the production Node.js runtime", () => {
    expect(
      shouldStartTaskInstanceScheduler({
        nodeEnv: "production",
        nextRuntime: "nodejs",
      }),
    ).toBe(true);
    expect(
      shouldStartTaskInstanceScheduler({
        nodeEnv: "development",
        nextRuntime: "nodejs",
      }),
    ).toBe(false);
    expect(
      shouldStartTaskInstanceScheduler({
        nodeEnv: "production",
        nextRuntime: "edge",
      }),
    ).toBe(false);
  });
});
