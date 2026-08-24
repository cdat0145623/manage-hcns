import { describe, expect, it } from "vitest";

import { mergeStoredAndVirtualTaskInstances } from "./task-instance-calendar";

type StoredOccurrence = {
  id: string;
  userId: string;
  taskMasterId: string;
  targetDate: Date;
  status: "pending" | "done" | "missed";
  isDeleted: boolean;
};

type VirtualOccurrence = {
  id: string;
  userId: string;
  taskMasterId: string;
  targetDate: Date;
  status: "pending";
};

const saturday = new Date("2026-08-22T01:00:00.000Z");
const monday = new Date("2026-08-24T01:00:00.000Z");

describe("mergeStoredAndVirtualTaskInstances", () => {
  it("keeps a missed stored instance after the master recurrence changes", () => {
    const stored: StoredOccurrence = {
      id: "stored-saturday",
      userId: "user-a",
      taskMasterId: "master-1",
      targetDate: saturday,
      status: "missed",
      isDeleted: false,
    };
    const virtual: VirtualOccurrence = {
      id: "virtual-monday",
      userId: "user-a",
      taskMasterId: "master-1",
      targetDate: monday,
      status: "pending",
    };

    const result = mergeStoredAndVirtualTaskInstances({
      storedInstances: [stored],
      virtualInstances: [virtual],
    });

    expect(result.map((item) => item.id)).toEqual([
      "stored-saturday",
      "virtual-monday",
    ]);
  });

  it("keeps active done and pending stored instances", () => {
    const result = mergeStoredAndVirtualTaskInstances({
      storedInstances: [
        {
          id: "stored-done",
          userId: "user-a",
          taskMasterId: "master-1",
          targetDate: saturday,
          status: "done",
          isDeleted: false,
        },
        {
          id: "stored-pending",
          userId: "user-a",
          taskMasterId: "master-2",
          targetDate: monday,
          status: "pending",
          isDeleted: false,
        },
      ],
      virtualInstances: [],
    });

    expect(result.map((item) => item.id)).toEqual([
      "stored-done",
      "stored-pending",
    ]);
  });

  it("prefers a stored instance over a virtual occurrence with the same occurrence key", () => {
    const result = mergeStoredAndVirtualTaskInstances({
      storedInstances: [
        {
          id: "stored-monday",
          userId: "user-a",
          taskMasterId: "master-1",
          targetDate: monday,
          status: "pending",
          isDeleted: false,
        },
      ],
      virtualInstances: [
        {
          id: "virtual-monday",
          userId: "user-a",
          taskMasterId: "master-1",
          targetDate: monday,
          status: "pending",
        },
      ],
    });

    expect(result.map((item) => item.id)).toEqual(["stored-monday"]);
  });

  it("uses a deleted stored instance as a tombstone without returning it", () => {
    const result = mergeStoredAndVirtualTaskInstances({
      storedInstances: [
        {
          id: "deleted-monday",
          userId: "user-a",
          taskMasterId: "master-1",
          targetDate: monday,
          status: "pending",
          isDeleted: true,
        },
      ],
      virtualInstances: [
        {
          id: "virtual-monday",
          userId: "user-a",
          taskMasterId: "master-1",
          targetDate: monday,
          status: "pending",
        },
      ],
    });

    expect(result).toEqual([]);
  });

  it("does not collapse occurrences belonging to different users", () => {
    const result = mergeStoredAndVirtualTaskInstances({
      storedInstances: [
        {
          id: "stored-user-a",
          userId: "user-a",
          taskMasterId: "master-1",
          targetDate: monday,
          status: "missed",
          isDeleted: false,
        },
      ],
      virtualInstances: [
        {
          id: "virtual-user-b",
          userId: "user-b",
          taskMasterId: "master-1",
          targetDate: monday,
          status: "pending",
        },
      ],
    });

    expect(result.map((item) => item.id)).toEqual([
      "stored-user-a",
      "virtual-user-b",
    ]);
  });
});
