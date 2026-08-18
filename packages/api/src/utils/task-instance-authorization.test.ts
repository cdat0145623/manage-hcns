import { describe, expect, it } from "vitest";

import { getTaskInstanceUpdateAuthorization } from "./task-instance-authorization";

const baseInput = {
  actorId: "actor",
  actorRole: "NVVP" as const,
  instanceUserId: "assignee",
  masterCreatedBy: "creator",
  instanceTaskMasterId: "master-1",
  requestedTaskMasterId: "master-1",
};

describe("getTaskInstanceUpdateAuthorization", () => {
  it("allows the task instance assignee", () => {
    expect(
      getTaskInstanceUpdateAuthorization({
        ...baseInput,
        actorId: "assignee",
      }),
    ).toBe("allowed");
  });

  it("allows the task master creator", () => {
    expect(
      getTaskInstanceUpdateAuthorization({
        ...baseInput,
        actorId: "creator",
      }),
    ).toBe("allowed");
  });

  it("allows an administrator", () => {
    expect(
      getTaskInstanceUpdateAuthorization({
        ...baseInput,
        actorRole: "ADMIN",
      }),
    ).toBe("allowed");
  });

  it("rejects an unrelated user", () => {
    expect(getTaskInstanceUpdateAuthorization(baseInput)).toBe("forbidden");
  });

  it("does not grant update access to a non-admin manager", () => {
    expect(
      getTaskInstanceUpdateAuthorization({
        ...baseInput,
        actorRole: "BRANCH_MANAGER",
      }),
    ).toBe("forbidden");
  });

  it("rejects a task master id that does not belong to the instance", () => {
    expect(
      getTaskInstanceUpdateAuthorization({
        ...baseInput,
        actorId: "assignee",
        requestedTaskMasterId: "master-2",
      }),
    ).toBe("task-master-mismatch");
  });
});
