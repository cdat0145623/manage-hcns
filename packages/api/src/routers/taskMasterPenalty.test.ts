import { describe, expect, it, vi } from "vitest";

import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
import * as userRepo from "@kan/db/repository/user.repo";

import { taskMasterRouter } from "./taskMaster";

vi.mock("@kan/db/repository/taskMaster.repo");
vi.mock("@kan/db/repository/taskInstance.repo", () => ({
  generateVirtualTaskInstances: vi.fn().mockResolvedValue([]),
}));
vi.mock("@kan/db/repository/user.repo");

const actorId = "11111111-1111-4111-8111-111111111111";
const masterId = "22222222-2222-4222-8222-222222222222";

function caller() {
  return taskMasterRouter.createCaller({
    user: {
      id: actorId,
      name: "Actor",
      email: "actor@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    db: {},
    headers: new Headers(),
  } as never);
}

describe("taskMaster penalty authorization and validation", () => {
  it("forbids a non-admin from listing recurring master tasks", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({ role: "NVVP" } as never);

    await expect(caller().listAdmin({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("forbids a non-admin from creating a master task", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({ role: "NVVP" } as never);

    await expect(
      caller().create({
        name: "Daily task",
        description: "",
        startDate: new Date("2026-08-26T02:00:00.000Z"),
        endDate: new Date("2026-08-26T03:00:00.000Z"),
        selectedUserId: actorId,
        rruleString: "FREQ=DAILY",
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-31T23:59:59.999Z"),
        penaltyPolicy: { priority: "high", amountMode: "default" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an override without an integer amount", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({ role: "ADMIN" } as never);

    await expect(
      caller().create({
        name: "Daily task",
        description: "",
        startDate: new Date("2026-08-26T02:00:00.000Z"),
        endDate: new Date("2026-08-26T03:00:00.000Z"),
        selectedUserId: actorId,
        rruleString: "FREQ=DAILY",
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-31T23:59:59.999Z"),
        penaltyPolicy: {
          priority: "high",
          amountMode: "override",
          overrideAmountVnd: 12.5,
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("passes a valid initial policy to the repository", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({ role: "ADMIN" } as never);
    vi.mocked(taskMasterRepo.create).mockResolvedValue({
      id: masterId,
      targetUser: actorId,
      startDate: new Date("2026-08-26T02:00:00.000Z"),
      endDate: new Date("2026-08-26T03:00:00.000Z"),
    } as never);

    await caller().create({
      name: "Daily task",
      description: "",
      startDate: new Date("2026-08-26T02:00:00.000Z"),
      endDate: new Date("2026-08-26T03:00:00.000Z"),
      selectedUserId: actorId,
      rruleString: "FREQ=DAILY",
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
      penaltyPolicy: {
        priority: "high",
        amountMode: "override",
        overrideAmountVnd: 0,
      },
    });

    expect(taskMasterRepo.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        penaltyPolicy: {
          priority: "high",
          amountMode: "override",
          overrideAmountVnd: 0,
        },
      }),
    );
  });

  it("forbids a non-admin from updating a master task", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({ role: "NVVP" } as never);

    await expect(
      caller().update({ id: masterId, name: "Updated" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepts a master policy update without an effective date", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({ role: "ADMIN" } as never);
    vi.mocked(taskMasterRepo.update).mockResolvedValue({ id: masterId } as never);

    await caller().update({
      id: masterId,
      penaltyPolicy: {
        policy: { priority: "medium", amountMode: "default" },
        priorityChangeAction: "use_new_default",
      },
    });
  });

  it("passes a policy decision without an effective date to the repository", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({ role: "ADMIN" } as never);
    vi.mocked(taskMasterRepo.update).mockResolvedValue({
      id: masterId,
    } as never);

    await caller().update({
      id: masterId,
      penaltyPolicy: {
        policy: { priority: "medium", amountMode: "default" },
        priorityChangeAction: "use_new_default",
      },
    });

    expect(taskMasterRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        penaltyPolicy: {
          policy: { priority: "medium", amountMode: "default" },
          priorityChangeAction: "use_new_default",
        },
      }),
    );
  });

  it("returns BAD_REQUEST when changing a priority with an override without a decision", async () => {
    vi.mocked(userRepo.getById).mockResolvedValue({ role: "ADMIN" } as never);
    vi.mocked(taskMasterRepo.update).mockRejectedValueOnce(
      new Error(
        "priorityChangeAction is required when changing a priority with an override",
      ),
    );

    await expect(
      caller().update({
        id: masterId,
        penaltyPolicy: {
          policy: { priority: "low", amountMode: "default" },
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
