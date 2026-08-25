import type { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as userRepo from "@kan/db/repository/user.repo";

import { taskInstanceRouter } from "./taskInstance";

vi.mock("@kan/db/repository/cardActivity.repo", () => ({
  getPaginatedActivitiesForTaskInstance: vi.fn(),
}));

vi.mock("@kan/db/repository/user.repo", () => ({
  getById: vi.fn(),
}));

const actorId = "11111111-1111-4111-8111-111111111111";
const assigneeId = "22222222-2222-4222-8222-222222222222";
const creatorId = "33333333-3333-4333-8333-333333333333";
const instanceId = "44444444-4444-4444-8444-444444444444";

function createCaller(options: {
  instanceUserId?: string;
  masterCreatedBy?: string;
}) {
  return taskInstanceRouter.createCaller({
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
        taskInstances: {
          findFirst: vi.fn().mockResolvedValue({
            userId: options.instanceUserId ?? assigneeId,
            taskMasterId: "55555555-5555-4555-8555-555555555555",
            taskMaster: {
              createdBy: options.masterCreatedBy ?? creatorId,
            },
          }),
        },
      },
    },
    headers: new Headers(),
  } as never);
}

describe("taskInstance.getActivities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      cardActivityRepo.getPaginatedActivitiesForTaskInstance,
    ).mockResolvedValue({ activities: [], hasMore: false } as never);
  });

  it.each([
    { role: "ADMIN", instanceUserId: assigneeId, masterCreatedBy: creatorId },
    { role: "NVVP", instanceUserId: actorId, masterCreatedBy: creatorId },
    { role: "NVVP", instanceUserId: assigneeId, masterCreatedBy: actorId },
  ])("allows an authorized viewer ($role)", async (viewer) => {
    vi.mocked(userRepo.getById).mockResolvedValue({
      id: actorId,
      role: viewer.role,
    } as never);

    await expect(
      createCaller(viewer).getActivities({ id: instanceId }),
    ).resolves.toMatchObject({ activities: [], hasMore: false });
  });

  it("forbids a user unrelated to the instance", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({
      id: actorId,
      role: "NVVP",
    } as never);

    await expect(
      createCaller({}).getActivities({ id: instanceId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
    expect(
      cardActivityRepo.getPaginatedActivitiesForTaskInstance,
    ).not.toHaveBeenCalled();
  });
});
