import { describe, expect, it, vi } from "vitest";

import { taskPenaltyRouter } from "./taskPenalty";

const { getDailyTaskPenaltyStatistics } = vi.hoisted(() => ({
  getDailyTaskPenaltyStatistics: vi.fn(),
}));

vi.mock("next-runtime-env", () => ({ env: vi.fn() }));
vi.mock("@kan/auth/server", () => ({ initAuth: vi.fn() }));
vi.mock("@kan/db/repository/taskPenaltyStatistics.repo", () => ({
  getDailyTaskPenaltyStatistics,
}));

const actorId = "11111111-1111-4111-8111-111111111111";

function createCaller(role: "ADMIN" | "NVVP") {
  return taskPenaltyRouter.createCaller({
    user: {
      id: actorId,
      name: "Actor",
      email: "actor@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    db: {
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({ role }),
        },
        taskPenaltyPolicies: {
          findMany: vi.fn().mockResolvedValue([
            {
              publicId: "sysdefaulthi",
              priority: "high",
              amountVnd: 200_000,
              source: "system_default",
              effectiveFrom: new Date("2026-08-25T00:00:00.000Z"),
              effectiveTo: new Date("2026-08-31T23:59:59.999Z"),
              revision: 1,
              supersededAt: null,
              createdAt: new Date("2026-08-25T00:00:00.000Z"),
            },
            {
              publicId: "adminpolicy01",
              priority: "high",
              amountVnd: 100_000,
              source: "global_policy",
              effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
              effectiveTo: new Date("2026-08-31T23:59:59.999Z"),
              revision: 2,
              supersededAt: null,
              createdAt: new Date("2026-08-26T08:30:00.000Z"),
            },
          ]),
        },
      },
    },
    headers: new Headers(),
  } as never);
}

describe("taskPenalty.settings", () => {
  it("returns current defaults to every authenticated user", async () => {
    const result = await createCaller("NVVP").settings();
    expect(result.priorities).toContainEqual(
      expect.objectContaining({ priority: "high", amountVnd: 100_000 }),
    );
    expect(result.priorities[0]).not.toHaveProperty("current");
    expect(result.priorities[0]).not.toHaveProperty("history");
  });

  it("forbids a non-admin from saving a policy", async () => {
    await expect(
      createCaller("NVVP").saveGlobalPolicy({
        priority: "high",
        amountVnd: 250_000,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects decimal and negative amounts", async () => {
    await expect(
      createCaller("ADMIN").saveGlobalPolicy({
        priority: "high",
        amountVnd: 12.5,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      createCaller("ADMIN").saveGlobalPolicy({
        priority: "high",
        amountVnd: -1,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

});

describe("taskPenalty.statistics", () => {
  it("returns all employees when an admin omits targetUserId", async () => {
    getDailyTaskPenaltyStatistics.mockResolvedValue({
      entries: [],
      total: { count: 0, amountVnd: 0 },
    });

    await createCaller("ADMIN").statistics({ month: "2026-08" });

    expect(getDailyTaskPenaltyStatistics).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetUserId: undefined }),
    );
  });

  it("rejects a regular user requesting another employee's statistics", async () => {
    await expect(
      createCaller("NVVP").statistics({
        month: "2026-08",
        targetUserId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
