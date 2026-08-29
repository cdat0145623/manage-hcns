import { describe, expect, it, vi } from "vitest";

import { dailyTaskKpiRouter } from "./dailyTaskKpi";

const saveDailyTaskKpiExclusionChanges = vi.hoisted(() => vi.fn());

vi.mock("next-runtime-env", () => ({ env: vi.fn() }));

vi.mock("@kan/auth/server", () => ({ initAuth: vi.fn() }));

vi.mock("@kan/db/repository/dailyTaskKpi.repo", async (importOriginal) => ({
  ...(await importOriginal()),
  saveDailyTaskKpiExclusionChanges,
}));

const adminId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const taskMasterId = "33333333-3333-4333-8333-333333333333";

describe("dailyTaskKpi.saveChanges", () => {
  it("rejects a non-admin before it can change KPI exclusions", async () => {
    const caller = dailyTaskKpiRouter.createCaller({
      user: {
        id: employeeId,
        name: "Employee",
        email: "employee@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      db: {
        query: {
          users: {
            findFirst: vi.fn().mockResolvedValue({ role: "NVVP" }),
          },
        },
      },
      headers: new Headers(),
    } as never);

    await expect(
      caller.saveChanges({
        targetUserId: employeeId,
        exclude: [{ taskMasterId, occurrenceDate: "2026-08-17" }],
        include: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepts a stored task instance even when it is absent from virtual RRULE output", async () => {
    const taskInstancesFindFirst = vi.fn().mockResolvedValue({
      id: "instance-1",
    });
    saveDailyTaskKpiExclusionChanges.mockResolvedValue(undefined);
    const caller = dailyTaskKpiRouter.createCaller({
      user: {
        id: adminId,
        name: "Admin",
        email: "admin@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      db: {
        query: {
          users: {
            findFirst: vi.fn().mockResolvedValue({ role: "ADMIN" }),
          },
          taskInstances: {
            findFirst: taskInstancesFindFirst,
          },
          taskMasters: {
            findFirst: vi.fn(),
          },
        },
      },
      headers: new Headers(),
    } as never);

    await expect(
      caller.saveChanges({
        targetUserId: employeeId,
        exclude: [{ taskMasterId, occurrenceDate: "2026-08-28" }],
        include: [],
      }),
    ).resolves.toEqual({ success: true });

    expect(taskInstancesFindFirst).toHaveBeenCalledOnce();
    expect(saveDailyTaskKpiExclusionChanges).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetUserId: employeeId,
        actorUserId: adminId,
      }),
    );
  });
});
