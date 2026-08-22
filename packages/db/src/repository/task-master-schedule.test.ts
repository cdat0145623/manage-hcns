import { describe, expect, it } from "vitest";

import {
  buildPendingInstanceReconciliation,
  getArchivedPendingInstanceIdsBlockingSchedules,
  hasSameRecurrenceCadence,
} from "./task-master-schedule";

describe("hasSameRecurrenceCadence", () => {
  it("ignores DTSTART, TZID, and wall-clock fields", () => {
    const oldRule =
      "DTSTART;TZID=Asia/Ho_Chi_Minh:20260817T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=9;BYMINUTE=0";
    const newRule =
      "DTSTART;TZID=UTC:20260824T020000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=14;BYMINUTE=30";

    expect(hasSameRecurrenceCadence(oldRule, newRule)).toBe(true);
  });

  it("detects a weekday cadence change", () => {
    expect(
      hasSameRecurrenceCadence(
        "FREQ=WEEKLY;BYDAY=MO,WE",
        "FREQ=WEEKLY;BYDAY=TU,TH",
      ),
    ).toBe(false);
  });
});

describe("getArchivedPendingInstanceIdsBlockingSchedules", () => {
  it("releases a legacy archived pending key needed by a time-only update", () => {
    const targetDate = new Date("2026-08-24T01:00:00.000Z");

    expect(
      getArchivedPendingInstanceIdsBlockingSchedules({
        materialized: [
          {
            id: "archived-pending",
            targetDate,
            status: "pending",
            isDeleted: true,
          },
        ],
        schedules: [{ targetDate }],
      }),
    ).toEqual(["archived-pending"]);
  });

  it("never releases the key of an archived terminal instance", () => {
    const targetDate = new Date("2026-08-24T01:00:00.000Z");

    expect(
      getArchivedPendingInstanceIdsBlockingSchedules({
        materialized: [
          {
            id: "archived-done",
            targetDate,
            status: "done",
            isDeleted: true,
          },
          {
            id: "archived-missed",
            targetDate,
            status: "missed",
            isDeleted: true,
          },
        ],
        schedules: [{ targetDate }],
      }),
    ).toEqual([]);
  });
});

describe("buildPendingInstanceReconciliation", () => {
  const existing = [
    {
      id: "monday",
      targetDate: new Date("2026-08-24T02:00:00.000Z"),
      endDate: new Date("2026-08-24T03:00:00.000Z"),
    },
    {
      id: "wednesday",
      targetDate: new Date("2026-08-26T02:00:00.000Z"),
      endDate: new Date("2026-08-26T03:00:00.000Z"),
    },
  ];

  it("preserves ids and calendar days for a time-only update", () => {
    const plan = buildPendingInstanceReconciliation({
      cadenceChanged: false,
      existing,
      desired: [],
      newMasterStartDate: new Date("2026-08-24T01:00:00.000Z"),
      newMasterEndDate: new Date("2026-08-24T02:30:00.000Z"),
    });

    expect(plan.archives).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([
      {
        id: "monday",
        targetDate: new Date("2026-08-24T01:00:00.000Z"),
        endDate: new Date("2026-08-24T02:30:00.000Z"),
      },
      {
        id: "wednesday",
        targetDate: new Date("2026-08-26T01:00:00.000Z"),
        endDate: new Date("2026-08-26T02:30:00.000Z"),
      },
    ]);
  });

  it("retains exact matches, archives removed days, and creates new days", () => {
    const plan = buildPendingInstanceReconciliation({
      cadenceChanged: true,
      existing,
      desired: [
        {
          targetDate: new Date("2026-08-24T02:00:00.000Z"),
          endDate: new Date("2026-08-24T04:00:00.000Z"),
        },
        {
          targetDate: new Date("2026-08-25T02:00:00.000Z"),
          endDate: new Date("2026-08-25T03:00:00.000Z"),
        },
      ],
      newMasterStartDate: new Date("2026-08-24T02:00:00.000Z"),
      newMasterEndDate: new Date("2026-08-24T03:00:00.000Z"),
    });

    expect(plan.updates).toEqual([
      {
        id: "monday",
        targetDate: new Date("2026-08-24T02:00:00.000Z"),
        endDate: new Date("2026-08-24T04:00:00.000Z"),
      },
    ]);
    expect(plan.archives).toEqual(["wednesday"]);
    expect(plan.creates).toEqual([
      {
        targetDate: new Date("2026-08-25T02:00:00.000Z"),
        endDate: new Date("2026-08-25T03:00:00.000Z"),
      },
    ]);
    expect(plan.retainedPending).toBe(1);
  });

  it("does not create over an immutable done or missed occurrence", () => {
    const occupiedDate = new Date("2026-08-25T02:00:00.000Z");
    const plan = buildPendingInstanceReconciliation({
      cadenceChanged: true,
      existing: [],
      desired: [
        {
          targetDate: new Date("2026-08-25T01:00:00.000Z"),
          endDate: new Date("2026-08-25T02:00:00.000Z"),
        },
      ],
      occupiedTargetDates: [occupiedDate],
      newMasterStartDate: new Date("2026-08-24T02:00:00.000Z"),
      newMasterEndDate: new Date("2026-08-24T03:00:00.000Z"),
    });

    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.archives).toEqual([]);
  });

  it("keeps the pending instance id when only its time changes during cadence reconciliation", () => {
    const plan = buildPendingInstanceReconciliation({
      cadenceChanged: true,
      existing: [existing[0]!],
      desired: [
        {
          targetDate: new Date("2026-08-24T01:00:00.000Z"),
          endDate: new Date("2026-08-24T02:00:00.000Z"),
        },
      ],
      newMasterStartDate: new Date("2026-08-24T01:00:00.000Z"),
      newMasterEndDate: new Date("2026-08-24T02:00:00.000Z"),
    });

    expect(plan.updates).toEqual([
      {
        id: "monday",
        targetDate: new Date("2026-08-24T01:00:00.000Z"),
        endDate: new Date("2026-08-24T02:00:00.000Z"),
      },
    ]);
    expect(plan.archives).toEqual([]);
    expect(plan.creates).toEqual([]);
  });

  it("keeps an overnight end time on the next Vietnam calendar day", () => {
    const plan = buildPendingInstanceReconciliation({
      cadenceChanged: false,
      existing: [
        {
          id: "overnight",
          targetDate: new Date("2026-08-24T15:00:00.000Z"),
          endDate: new Date("2026-08-24T17:00:00.000Z"),
        },
      ],
      desired: [],
      newMasterStartDate: new Date("2026-08-24T15:00:00.000Z"),
      newMasterEndDate: new Date("2026-08-24T18:00:00.000Z"),
    });

    expect(plan.updates[0]?.targetDate.toISOString()).toBe(
      "2026-08-24T15:00:00.000Z",
    );
    expect(plan.updates[0]?.endDate.toISOString()).toBe(
      "2026-08-24T18:00:00.000Z",
    );
  });
});
