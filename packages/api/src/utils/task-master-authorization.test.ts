import { describe, expect, it } from "vitest";

import { canUpdateTaskMaster } from "./task-master-authorization";

describe("canUpdateTaskMaster", () => {
  it.each([
    ["admin", "ADMIN", "other", "other", true],
    ["creator", "NVVP", "creator", "assignee", true],
    ["assignee", "NVVP", "creator", "assignee", true],
    ["other", "NVVP", "creator", "assignee", false],
  ] as const)(
    "authorizes %s correctly",
    (actorId, actorRole, createdBy, targetUser, expected) => {
      expect(
        canUpdateTaskMaster({ actorId, actorRole, createdBy, targetUser }),
      ).toBe(expected);
    },
  );
});
