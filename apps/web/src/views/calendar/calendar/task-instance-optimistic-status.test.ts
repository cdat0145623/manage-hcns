import { describe, expect, it } from "vitest";

import { getOptimisticTaskStatus } from "./task-instance-optimistic-status";

describe("getOptimisticTaskStatus", () => {
  it.each(["pending", "missed"] as const)(
    "optimistically completes a %s task",
    (currentStatus) => {
      expect(getOptimisticTaskStatus(currentStatus, "done")).toBe("done");
    },
  );

  it("waits for the server when reopening a completed task", () => {
    expect(getOptimisticTaskStatus("done", "pending")).toBeNull();
  });

  it.each(["pending", "missed", "done"] as const)(
    "does not optimistically update an unchanged %s status",
    (status) => {
      expect(getOptimisticTaskStatus(status, status)).toBeNull();
    },
  );
});
