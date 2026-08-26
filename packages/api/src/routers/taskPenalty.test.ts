import { describe, expect, it, vi } from "vitest";

import { taskPenaltyRouter } from "./taskPenalty";

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
  it("returns grouped public policy views to a system admin", async () => {
    const result = await createCaller("ADMIN").settings();

    expect(result.priorities.map((item) => item.priority)).toEqual([
      "high",
      "medium",
      "low",
    ]);
    expect(result.priorities[0]?.current).toMatchObject({
      publicId: "adminpolicy01",
      amountVnd: 100_000,
      effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-08-31T23:59:59.999Z"),
      createdAt: new Date("2026-08-26T08:30:00.000Z"),
      revision: 2,
    });
    expect(result.priorities[0]?.current).not.toHaveProperty("id");
    expect(result.priorities[0]?.history).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ publicId: "sysdefaulthi" }),
      ]),
    );
  });

  it("forbids a non-admin", async () => {
    await expect(createCaller("NVVP").settings()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("forbids a non-admin from saving a policy", async () => {
    await expect(
      createCaller("NVVP").saveGlobalPolicy({
        priority: "high",
        amountVnd: 250_000,
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-08-30T23:59:59.999Z"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects decimal and negative amounts", async () => {
    await expect(
      createCaller("ADMIN").saveGlobalPolicy({
        priority: "high",
        amountVnd: 12.5,
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-08-30T23:59:59.999Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      createCaller("ADMIN").saveGlobalPolicy({
        priority: "high",
        amountVnd: -1,
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-08-30T23:59:59.999Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires an explicit end date", async () => {
    await expect(
      // @ts-expect-error verifies runtime validation for malformed client input
      createCaller("ADMIN").saveGlobalPolicy({
        priority: "high",
        amountVnd: 250_000,
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an end date before its start date", async () => {
    await expect(
      createCaller("ADMIN").saveGlobalPolicy({
        priority: "high",
        amountVnd: 250_000,
        effectiveFrom: new Date("2026-08-30T00:00:00.000Z"),
        effectiveTo: new Date("2026-08-01T23:59:59.999Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
