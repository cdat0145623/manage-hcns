import { describe, expect, it } from "vitest";

import {
  resolveTaskInstanceEndDate,
  resolveTaskInstanceStatusTransition,
} from "./taskInstanceStatusTransition";

const now = new Date("2026-08-17T02:20:00.000Z");
const previousActualDate = new Date("2026-08-17T01:30:00.000Z");

describe("resolveTaskInstanceStatusTransition", () => {
  const endDate = new Date("2026-08-17T02:00:00.000Z");

  it("records server time when a pending task is completed", () => {
    expect(
      resolveTaskInstanceStatusTransition({
        oldStatus: "pending",
        requestedStatus: "done",
        currentActualDate: null,
        endDate,
        now,
      }),
    ).toEqual({ status: "done", actualDate: now });
  });

  it("preserves actualDate when status does not change", () => {
    expect(
      resolveTaskInstanceStatusTransition({
        oldStatus: "done",
        requestedStatus: "done",
        currentActualDate: previousActualDate,
        endDate,
        now,
      }),
    ).toEqual({ status: "done", actualDate: previousActualDate });
  });

  it("converts done to pending before or at the deadline", () => {
    expect(
      resolveTaskInstanceStatusTransition({
        oldStatus: "done",
        requestedStatus: "pending",
        currentActualDate: previousActualDate,
        endDate,
        now: endDate,
      }),
    ).toEqual({ status: "pending", actualDate: null });
  });

  it("converts done to missed after the deadline", () => {
    expect(
      resolveTaskInstanceStatusTransition({
        oldStatus: "done",
        requestedStatus: "pending",
        currentActualDate: previousActualDate,
        endDate,
        now: new Date("2026-08-17T02:10:00.000Z"),
      }),
    ).toEqual({ status: "missed", actualDate: null });
  });

  it.each([
    ["missed", "done"],
    ["missed", "pending"],
    ["pending", "missed"],
  ] as const)("rejects %s to %s", (oldStatus, requestedStatus) => {
    expect(
      resolveTaskInstanceStatusTransition({
        oldStatus,
        requestedStatus,
        currentActualDate: null,
        endDate,
        now: new Date("2026-08-17T02:10:00.000Z"),
      }),
    ).toBeNull();
  });
});

describe("resolveTaskInstanceEndDate", () => {
  it("preserves the stored deadline when the occurrence date is unchanged", () => {
    const storedEndDate = new Date("2026-08-17T02:00:00.000Z");

    expect(
      resolveTaskInstanceEndDate({
        storedEndDate,
        storedTargetDate: new Date("2026-08-17T01:00:00.000Z"),
        requestedTargetDate: undefined,
        masterEndDate: new Date("2026-08-24T04:00:00.000Z"),
      }),
    ).toEqual(storedEndDate);
  });

  it("preserves the stored deadline when the requested occurrence timestamp is unchanged", () => {
    const storedTargetDate = new Date("2026-08-17T01:00:00.000Z");
    const storedEndDate = new Date("2026-08-18T02:00:00.000Z");

    expect(
      resolveTaskInstanceEndDate({
        storedEndDate,
        storedTargetDate,
        requestedTargetDate: new Date(storedTargetDate),
        masterEndDate: new Date("2026-08-17T04:00:00.000Z"),
      }),
    ).toEqual(storedEndDate);
  });
});
