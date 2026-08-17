import { describe, expect, it } from "vitest";

import {
  isAllowedUserTaskInstanceStatusTransition,
  resolveActualDateForStatusTransition,
} from "./taskInstanceStatusTransition";

const now = new Date("2026-08-17T02:20:00.000Z");
const previousActualDate = new Date("2026-08-17T01:30:00.000Z");

describe("resolveActualDateForStatusTransition", () => {
  it.each([
    ["pending", "done"],
    ["missed", "done"],
  ] as const)("records server time for %s to %s", (oldStatus, newStatus) => {
    expect(
      resolveActualDateForStatusTransition({
        oldStatus,
        newStatus,
        currentActualDate: null,
        now,
      }),
    ).toEqual(now);
  });

  it("clears actualDate when a done instance is reopened", () => {
    expect(
      resolveActualDateForStatusTransition({
        oldStatus: "done",
        newStatus: "pending",
        currentActualDate: previousActualDate,
        now,
      }),
    ).toBeNull();
  });

  it("preserves actualDate when status does not change", () => {
    expect(
      resolveActualDateForStatusTransition({
        oldStatus: "done",
        newStatus: "done",
        currentActualDate: previousActualDate,
        now,
      }),
    ).toEqual(previousActualDate);
  });
});

describe("isAllowedUserTaskInstanceStatusTransition", () => {
  it("allows a missed instance to be completed", () => {
    expect(
      isAllowedUserTaskInstanceStatusTransition({
        oldStatus: "missed",
        newStatus: "done",
      }),
    ).toBe(true);
  });

  it("does not allow a missed instance to be reset to pending", () => {
    expect(
      isAllowedUserTaskInstanceStatusTransition({
        oldStatus: "missed",
        newStatus: "pending",
      }),
    ).toBe(false);
  });
});
