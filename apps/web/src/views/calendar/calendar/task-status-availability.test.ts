import { describe, expect, it } from "vitest";

import { canUpdateTaskStatus } from "./task-status-availability";

describe("canUpdateTaskStatus", () => {
  it("blocks task status mutations while session verification is unavailable", () => {
    expect(
      canUpdateTaskStatus({
        canEdit: true,
        isBusy: false,
        sessionStatus: "unavailable",
      }),
    ).toBe(false);
  });

  it("allows an authorized idle user with an authenticated session", () => {
    expect(
      canUpdateTaskStatus({
        canEdit: true,
        isBusy: false,
        sessionStatus: "authenticated",
      }),
    ).toBe(true);
  });

  it("continues to block unauthorized or busy users", () => {
    expect(
      canUpdateTaskStatus({
        canEdit: false,
        isBusy: false,
        sessionStatus: "authenticated",
      }),
    ).toBe(false);
    expect(
      canUpdateTaskStatus({
        canEdit: true,
        isBusy: true,
        sessionStatus: "authenticated",
      }),
    ).toBe(false);
  });
});
