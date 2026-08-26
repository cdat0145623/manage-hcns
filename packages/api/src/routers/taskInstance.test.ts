import { beforeEach, describe, expect, it, vi } from "vitest";

import { taskInstanceRouter } from "./taskInstance";

const userAId = "11111111-1111-4111-8111-111111111111";
const userBId = "22222222-2222-4222-8222-222222222222";
const masterId = "33333333-3333-4333-8333-333333333333";
const saturday = new Date("2026-08-22T01:00:00.000Z");
const monday = new Date("2026-08-24T01:00:00.000Z");

describe("taskInstance.getVirtual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a missed stored instance after its master changes recurrence and assignee", async () => {
    const taskMaster = {
      id: masterId,
      name: "Recurring task",
      description: "Historical task instance regression",
      targetUser: userBId,
      createdBy: userBId,
      startDate: monday,
      endDate: new Date("2026-08-24T02:00:00.000Z"),
      isDeleted: false,
      frequence: {
        rruleString: "FREQ=WEEKLY;BYDAY=MO",
        dtStart: monday,
      },
      assignee: { id: userBId, name: "User B" },
    };
    const missedStoredInstance = {
      id: "44444444-4444-4444-8444-444444444444",
      userId: userAId,
      taskMasterId: masterId,
      name: "Recurring task",
      description: "Historical task instance regression",
      targetDate: saturday,
      actualDate: null,
      endDate: new Date("2026-08-22T02:00:00.000Z"),
      status: "missed" as const,
      isDeleted: false,
      createdAt: saturday,
      updatedAt: saturday,
      deleteAt: null,
      deleteBy: null,
      checklists: [],
      user: { id: userAId, name: "User A" },
      taskMaster,
    };

    const caller = taskInstanceRouter.createCaller({
      user: {
        id: userAId,
        name: "User A",
        email: "user-a@example.com",
        emailVerified: true,
        createdAt: saturday,
        updatedAt: saturday,
      },
      db: {
        query: {
          taskMasters: { findMany: vi.fn().mockResolvedValue([]) },
          taskInstances: {
            findMany: vi.fn().mockResolvedValue([missedStoredInstance]),
          },
        },
      },
      headers: new Headers(),
    } as never);

    const result = (await caller.getVirtual({
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
      targetUser: userAId,
    })) as unknown[];

    expect(result).toContainEqual(
      expect.objectContaining({
        id: missedStoredInstance.id,
        userId: userAId,
        status: "missed",
        targetDate: saturday,
      }),
    );
  });

  it("does not return a virtual occurrence when a deleted stored instance is its tombstone", async () => {
    const taskMaster = {
      id: masterId,
      name: "Recurring task",
      description: "Deleted occurrence regression",
      targetUser: userAId,
      createdBy: userAId,
      startDate: monday,
      endDate: new Date("2026-08-24T02:00:00.000Z"),
      isDeleted: false,
      frequence: {
        rruleString: "FREQ=WEEKLY;BYDAY=MO",
        dtStart: monday,
      },
      assignee: { id: userAId, name: "User A" },
    };
    const deletedStoredInstance = {
      id: "44444444-4444-4444-8444-444444444444",
      userId: userAId,
      taskMasterId: masterId,
      name: "Recurring task",
      description: "Deleted occurrence regression",
      targetDate: monday,
      actualDate: null,
      endDate: new Date("2026-08-24T02:00:00.000Z"),
      status: "pending" as const,
      isDeleted: true,
      createdAt: monday,
      updatedAt: monday,
      deleteAt: monday,
      deleteBy: userAId,
      checklists: [],
      user: { id: userAId, name: "User A" },
      taskMaster,
    };

    const caller = taskInstanceRouter.createCaller({
      user: {
        id: userAId,
        name: "User A",
        email: "user-a@example.com",
        emailVerified: true,
        createdAt: monday,
        updatedAt: monday,
      },
      db: {
        query: {
          taskMasters: { findMany: vi.fn().mockResolvedValue([taskMaster]) },
          taskInstances: {
            findMany: vi.fn().mockResolvedValue([deletedStoredInstance]),
          },
          taskMasterPenaltyPolicies: {
            findMany: vi.fn().mockResolvedValue([]),
          },
          taskPenaltyPolicies: { findMany: vi.fn().mockResolvedValue([]) },
        },
      },
      headers: new Headers(),
    } as never);

    await expect(
      caller.getVirtual({
        from: new Date("2026-08-24T00:00:00.000Z"),
        to: new Date("2026-08-24T23:59:59.999Z"),
        targetUser: userAId,
      }),
    ).resolves.toEqual([]);
  });
});
