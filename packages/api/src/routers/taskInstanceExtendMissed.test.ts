import type { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as taskInstanceStatusRepo from "@kan/db/repository/taskInstanceStatus.repo";
import * as userRepo from "@kan/db/repository/user.repo";

import { taskInstanceRouter } from "./taskInstance";

vi.mock("@kan/db/repository/taskInstanceStatus.repo", () => ({
  extendMissedTaskInstance: vi.fn(),
}));

vi.mock("@kan/db/repository/user.repo", () => ({
  getById: vi.fn(),
}));

vi.mock("../utils/rewardViolation", () => ({
  trackTaskInstanceRewardViolations: vi.fn().mockResolvedValue(undefined),
  markTaskInstanceConfigWaitingEvaluation: vi.fn().mockResolvedValue(undefined),
  revertTaskInstanceConfigToApproved: vi.fn().mockResolvedValue(undefined),
}));

const adminId = "11111111-1111-4111-8111-111111111111";
const instanceId = "22222222-2222-4222-8222-222222222222";
const extensionPublicId = "extend123456";
const originalEndDate = new Date("2026-08-17T02:00:00.000Z");
const newEndDate = new Date("2099-08-18T02:00:00.000Z");
const extendedAt = new Date("2026-08-17T03:00:00.000Z");

function createCaller() {
  return taskInstanceRouter.createCaller({
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
        taskInstances: {
          findFirst: vi.fn().mockResolvedValue({
            id: instanceId,
            status: "missed",
            isDeleted: false,
            endDate: originalEndDate,
          }),
        },
      },
    },
    headers: new Headers(),
  } as never);
}

describe("taskInstance.extendMissed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forbids a non-admin from reopening a missed instance", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({
      id: adminId,
      role: "NVVP",
    } as never);

    await expect(
      createCaller().extendMissed({
        id: instanceId,
        newEndDate,
        reason: "Nghỉ phép",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
  });

  it("reopens a missed instance for an admin", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({
      id: adminId,
      role: "ADMIN",
    } as never);
    vi.mocked(
      taskInstanceStatusRepo.extendMissedTaskInstance,
    ).mockResolvedValue({
      instance: {
        id: instanceId,
        status: "pending",
        endDate: newEndDate,
        actualDate: null,
      },
      extension: {
        publicId: extensionPublicId,
        previousEndDate: originalEndDate,
        newEndDate,
        reason: "Nghỉ phép",
        extendedBy: adminId,
        createdAt: extendedAt,
      },
    } as never);

    await expect(
      createCaller().extendMissed({
        id: instanceId,
        newEndDate,
        reason: "  Nghỉ phép  ",
      }),
    ).resolves.toMatchObject({
      status: "pending",
      endDate: newEndDate,
      extension: {
        publicId: extensionPublicId,
        previousEndDate: originalEndDate,
        newEndDate,
        reason: "Nghỉ phép",
        extendedAt,
      },
    });

    expect(
      taskInstanceStatusRepo.extendMissedTaskInstance,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskInstanceId: instanceId,
        newEndDate,
        reason: "Nghỉ phép",
        actorUserId: adminId,
      }),
    );
  });

  it("returns conflict when the instance was already reopened", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({
      id: adminId,
      role: "ADMIN",
    } as never);
    vi.mocked(
      taskInstanceStatusRepo.extendMissedTaskInstance,
    ).mockResolvedValue(null);

    await expect(
      createCaller().extendMissed({
        id: instanceId,
        newEndDate,
        reason: "Nghỉ phép",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<TRPCError>);
  });

  it("rejects a deadline that is not in the future", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({
      id: adminId,
      role: "ADMIN",
    } as never);

    await expect(
      createCaller().extendMissed({
        id: instanceId,
        newEndDate: new Date("2020-08-18T02:00:00.000Z"),
        reason: "Nghỉ phép",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });

  it("rejects a blank extension reason", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({
      id: adminId,
      role: "ADMIN",
    } as never);

    await expect(
      createCaller().extendMissed({
        id: instanceId,
        newEndDate,
        reason: "   ",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
