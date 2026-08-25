import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import type { dbClient } from "@kan/db/client";
import { getPaginatedActivitiesForTaskInstance } from "@kan/db/repository/cardActivity.repo";
import { getCalendarMetrics } from "@kan/db/repository/dashboard.repo";
import { update as updateTaskInstance } from "@kan/db/repository/taskInstance.repo";
import {
  backfillTaskInstanceActualDates,
  extendMissedTaskInstance,
  markOverdueTaskInstancesMissed,
} from "@kan/db/repository/taskInstanceStatus.repo";
import {
  cardActivities,
  frequences,
  taskInstances,
  taskMasters,
  users,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

import { startPostgresTestTransaction } from "./postgresTestTransaction";

const POSTGRES_URL = process.env.POSTGRES_URL;

if (!POSTGRES_URL) {
  throw new Error(
    "POSTGRES_URL is required for taskInstanceStatus integration tests",
  );
}

const pool = new Pool({ connectionString: POSTGRES_URL });
let db: dbClient;
let rollback: () => Promise<void>;

beforeAll(async () => {
  await pool.query("select 1");
});

beforeEach(async () => {
  ({ db, rollback } = await startPostgresTestTransaction(pool));
});

afterEach(async () => {
  await rollback();
});

afterAll(async () => {
  await pool.end();
});

async function seedTaskInstance(params: {
  status: "pending" | "done" | "missed";
  targetDate: Date;
  endDate: Date | null;
  actualDate?: Date | null;
  isDeleted?: boolean;
}) {
  const userId = randomUUID();
  const frequencyId = randomUUID();
  const taskMasterId = randomUUID();
  const taskInstanceId = randomUUID();

  await db.insert(users).values({
    id: userId,
    name: "Phase 2 PostgreSQL Test",
    email: `${userId}@phase2.test`,
    emailVerified: true,
  });

  await db.insert(frequences).values({
    id: frequencyId,
    name: "Phase 2 test frequency",
    rruleString: "FREQ=DAILY",
    dtStart: params.targetDate,
  });

  await db.insert(taskMasters).values({
    id: taskMasterId,
    freqId: frequencyId,
    name: "Phase 2 test task",
    startDate: params.targetDate,
    endDate: params.endDate ?? params.targetDate,
    targetUser: userId,
    createdBy: userId,
  });

  await db.insert(taskInstances).values({
    id: taskInstanceId,
    userId,
    taskMasterId,
    name: "Phase 2 test task",
    targetDate: params.targetDate,
    originalEndDate: params.endDate,
    endDate: params.endDate,
    actualDate: params.actualDate,
    status: params.status,
    isDeleted: params.isDeleted ?? false,
  });

  return { taskInstanceId, taskMasterId, userId };
}

describe("extendMissedTaskInstance", () => {
  it("reopens a missed instance and records the admin extension audit", async () => {
    const originalEndDate = new Date("2026-08-17T02:00:00.000Z");
    const extendedEndDate = new Date("2026-08-18T02:00:00.000Z");
    const now = new Date("2026-08-17T03:00:00.000Z");
    const { taskInstanceId, userId } = await seedTaskInstance({
      status: "missed",
      targetDate: new Date("2026-08-17T01:00:00.000Z"),
      endDate: originalEndDate,
    });

    const result = await extendMissedTaskInstance(db, {
      taskInstanceId,
      newEndDate: extendedEndDate,
      reason: "Nhân viên nghỉ phép",
      actorUserId: userId,
      now,
    });

    const activities = await db.query.cardActivities.findMany({
      where: (table, { eq }) => eq(table.taskInstanceId, taskInstanceId),
    });
    const extensions = await db.query.taskInstanceExtensions.findMany({
      where: (table, { eq }) => eq(table.taskInstanceId, taskInstanceId),
    });
    const activityPage = await getPaginatedActivitiesForTaskInstance(
      db,
      taskInstanceId,
    );

    expect(result).toMatchObject({
      instance: {
        status: "pending",
        endDate: extendedEndDate,
        actualDate: null,
      },
      extension: {
        previousEndDate: originalEndDate,
        newEndDate: extendedEndDate,
        reason: "Nhân viên nghỉ phép",
        extendedBy: userId,
        createdAt: now,
      },
    });
    expect(result?.extension.publicId).toHaveLength(12);
    expect(activities).toHaveLength(2);
    expect(extensions).toHaveLength(1);

    const deadlineExtendedActivity = activities.find(
      (activity) => String(activity.type) === "deadline_extended",
    );
    const statusChangedActivity = activities.find(
      (activity) => activity.type === "status_changed",
    );

    expect(deadlineExtendedActivity).toMatchObject({
      fromDueDate: originalEndDate,
      toDueDate: extendedEndDate,
      createdBy: userId,
      metadata: null,
    });
    expect(statusChangedActivity).toMatchObject({
      type: "status_changed",
      oldValue: "missed",
      newValue: "pending",
      createdBy: userId,
      metadata: null,
    });
    const extensionActivity = activityPage.activities.find(
      (activity) => String(activity.type) === "deadline_extended",
    );
    expect(extensionActivity?.taskInstanceExtension).toMatchObject({
      previousEndDate: originalEndDate,
      newEndDate: extendedEndDate,
      reason: "Nhân viên nghỉ phép",
      createdAt: now,
    });
    expect(extensionActivity?.taskInstanceExtension?.publicId).toHaveLength(12);
    expect(extensionActivity?.taskInstanceExtension).not.toHaveProperty("id");
  });

  it("allows only one extension when two requests target the same missed instance", async () => {
    const { taskInstanceId, userId } = await seedTaskInstance({
      status: "missed",
      targetDate: new Date("2026-08-17T01:00:00.000Z"),
      endDate: new Date("2026-08-17T02:00:00.000Z"),
    });

    const options = {
      taskInstanceId,
      newEndDate: new Date("2026-08-18T02:00:00.000Z"),
      reason: "Nhân viên nghỉ phép",
      actorUserId: userId,
      now: new Date("2026-08-17T03:00:00.000Z"),
    };

    const firstResult = await extendMissedTaskInstance(db, options);
    const secondResult = await extendMissedTaskInstance(db, options);

    const activities = await db.query.cardActivities.findMany({
      where: (table, { eq }) => eq(table.taskInstanceId, taskInstanceId),
    });

    expect(firstResult?.instance.status).toBe("pending");
    expect(secondResult).toBeNull();
    expect(activities).toHaveLength(2);
  });

  it("records a second extension after the reopened instance becomes missed again", async () => {
    const firstDeadline = new Date("2026-08-17T02:00:00.000Z");
    const secondDeadline = new Date("2026-08-18T02:00:00.000Z");
    const thirdDeadline = new Date("2026-08-19T02:00:00.000Z");
    const { taskInstanceId, userId } = await seedTaskInstance({
      status: "missed",
      targetDate: new Date("2026-08-17T01:00:00.000Z"),
      endDate: firstDeadline,
    });

    await extendMissedTaskInstance(db, {
      taskInstanceId,
      newEndDate: secondDeadline,
      reason: "Gia hạn lần một",
      actorUserId: userId,
      now: new Date("2026-08-17T03:00:00.000Z"),
    });
    await markOverdueTaskInstancesMissed(db, {
      taskInstanceId,
      now: new Date("2026-08-18T03:00:00.000Z"),
    });
    const secondExtension = await extendMissedTaskInstance(db, {
      taskInstanceId,
      newEndDate: thirdDeadline,
      reason: "Gia hạn lần hai",
      actorUserId: userId,
      now: new Date("2026-08-18T04:00:00.000Z"),
    });

    const extensions = await db.query.taskInstanceExtensions.findMany({
      where: (table, { eq }) => eq(table.taskInstanceId, taskInstanceId),
      orderBy: (table, { asc }) => asc(table.createdAt),
    });

    expect(secondExtension?.instance).toMatchObject({
      status: "pending",
      endDate: thirdDeadline,
    });
    expect(extensions).toMatchObject([
      {
        previousEndDate: firstDeadline,
        newEndDate: secondDeadline,
        reason: "Gia hạn lần một",
      },
      {
        previousEndDate: secondDeadline,
        newEndDate: thirdDeadline,
        reason: "Gia hạn lần hai",
      },
    ]);
  });

  it("rejects a stale generic edit after an admin extension wins the race", async () => {
    const originalEndDate = new Date("2026-08-17T02:00:00.000Z");
    const extendedEndDate = new Date("2026-08-18T02:00:00.000Z");
    const { taskInstanceId, taskMasterId, userId } = await seedTaskInstance({
      status: "missed",
      targetDate: new Date("2026-08-17T01:00:00.000Z"),
      endDate: originalEndDate,
    });

    await extendMissedTaskInstance(db, {
      taskInstanceId,
      newEndDate: extendedEndDate,
      reason: "Nhân viên nghỉ phép",
      actorUserId: userId,
      now: new Date("2026-08-17T03:00:00.000Z"),
    });

    const staleUpdate = await updateTaskInstance(db, {
      id: taskInstanceId,
      expectedStatus: "missed",
      userId,
      taskMasterId,
      description: "Stale description edit",
      endDate: originalEndDate,
      status: "missed",
      actorUserId: userId,
    });
    const currentInstance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });

    expect(staleUpdate).toBeNull();
    expect(currentInstance).toMatchObject({
      status: "pending",
      endDate: extendedEndDate,
    });
  });

  it("does not let a generic edit replace an established extension deadline", async () => {
    const originalTargetDate = new Date("2026-08-17T01:00:00.000Z");
    const originalEndDate = new Date("2026-08-17T02:00:00.000Z");
    const extendedEndDate = new Date("2026-08-18T02:00:00.000Z");
    const { taskInstanceId, taskMasterId, userId } = await seedTaskInstance({
      status: "missed",
      targetDate: originalTargetDate,
      endDate: originalEndDate,
    });

    await extendMissedTaskInstance(db, {
      taskInstanceId,
      newEndDate: extendedEndDate,
      reason: "Nghỉ phép",
      actorUserId: userId,
      now: new Date("2026-08-17T03:00:00.000Z"),
    });
    const genericUpdate = await updateTaskInstance(db, {
      id: taskInstanceId,
      expectedStatus: "pending",
      userId,
      taskMasterId,
      targetDate: new Date("2026-08-17T04:00:00.000Z"),
      endDate: new Date("2026-08-17T05:00:00.000Z"),
      status: "pending",
      actorUserId: userId,
    });
    const currentInstance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });

    expect(genericUpdate).toBeNull();
    expect(currentInstance).toMatchObject({
      targetDate: originalTargetDate,
      originalEndDate,
      endDate: extendedEndDate,
    });
  });

  it("marks an extended instance missed only after its new deadline", async () => {
    const extendedEndDate = new Date("2026-08-18T02:00:00.000Z");
    const { taskInstanceId, userId } = await seedTaskInstance({
      status: "missed",
      targetDate: new Date("2026-08-17T01:00:00.000Z"),
      endDate: new Date("2026-08-17T02:00:00.000Z"),
    });

    await extendMissedTaskInstance(db, {
      taskInstanceId,
      newEndDate: extendedEndDate,
      reason: "Nhân viên nghỉ phép",
      actorUserId: userId,
      now: new Date("2026-08-17T03:00:00.000Z"),
    });

    const atDeadline = await markOverdueTaskInstancesMissed(db, {
      taskInstanceId,
      now: extendedEndDate,
    });
    const afterDeadline = await markOverdueTaskInstancesMissed(db, {
      taskInstanceId,
      now: new Date("2026-08-18T02:00:01.000Z"),
    });
    const currentInstance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });

    expect(atDeadline).toEqual({ matched: 0, updated: 0 });
    expect(afterDeadline).toEqual({ matched: 1, updated: 1 });
    expect(currentInstance?.status).toBe("missed");
  });
});

describe("markOverdueTaskInstancesMissed", () => {
  it("marks a pending instance missed only after endDate and logs one scheduler activity", async () => {
    const now = new Date("2026-08-17T03:00:00.000Z");
    const { taskInstanceId } = await seedTaskInstance({
      status: "pending",
      targetDate: new Date("2026-08-17T01:00:00.000Z"),
      endDate: new Date("2026-08-17T02:00:00.000Z"),
    });

    const result = await markOverdueTaskInstancesMissed(db, {
      now,
      taskInstanceId,
    });

    const instance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });
    const activities = await db.query.cardActivities.findMany({
      where: (table, { eq }) => eq(table.taskInstanceId, taskInstanceId),
    });

    expect(result).toEqual({ matched: 1, updated: 1 });
    expect(instance?.status).toBe("missed");
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      type: "status_changed",
      oldValue: "pending",
      newValue: "missed",
      createdBy: null,
      metadata: { source: "scheduler" },
    });
  });

  it("keeps a pending instance pending until its endDate has passed", async () => {
    const now = new Date("2026-08-17T02:00:00.000Z");
    const { taskInstanceId } = await seedTaskInstance({
      status: "pending",
      targetDate: new Date("2026-08-17T01:00:00.000Z"),
      endDate: now,
    });

    const result = await markOverdueTaskInstancesMissed(db, {
      now,
      taskInstanceId,
    });

    const instance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });

    expect(result).toEqual({ matched: 0, updated: 0 });
    expect(instance?.status).toBe("pending");
  });

  it("does not mutate an overdue instance during dry-run", async () => {
    const now = new Date("2026-08-17T03:00:00.000Z");
    const { taskInstanceId } = await seedTaskInstance({
      status: "pending",
      targetDate: new Date("2026-08-17T01:00:00.000Z"),
      endDate: new Date("2026-08-17T02:00:00.000Z"),
    });

    const result = await markOverdueTaskInstancesMissed(db, {
      now,
      taskInstanceId,
      dryRun: true,
    });

    const instance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });

    expect(result).toEqual({ matched: 1, updated: 0 });
    expect(instance?.status).toBe("pending");
  });

  it("is idempotent and does not duplicate scheduler activities", async () => {
    const now = new Date("2026-08-17T03:00:00.000Z");
    const { taskInstanceId } = await seedTaskInstance({
      status: "pending",
      targetDate: new Date("2026-08-17T01:00:00.000Z"),
      endDate: new Date("2026-08-17T02:00:00.000Z"),
    });

    await markOverdueTaskInstancesMissed(db, { now, taskInstanceId });
    const secondResult = await markOverdueTaskInstancesMissed(db, {
      now: new Date("2026-08-17T04:00:00.000Z"),
      taskInstanceId,
    });

    const activities = await db.query.cardActivities.findMany({
      where: (table, { eq }) => eq(table.taskInstanceId, taskInstanceId),
    });

    expect(secondResult).toEqual({ matched: 0, updated: 0 });
    expect(activities).toHaveLength(1);
  });
});

describe("backfillTaskInstanceActualDates", () => {
  it("uses the latest done activity for an invalid actualDate", async () => {
    const targetDate = new Date("2026-08-17T01:00:00.000Z");
    const { taskInstanceId } = await seedTaskInstance({
      status: "done",
      targetDate,
      endDate: new Date("2026-08-17T02:00:00.000Z"),
      actualDate: targetDate,
    });
    const firstDoneAt = new Date("2026-08-17T01:30:00.000Z");
    const latestDoneAt = new Date("2026-08-17T02:30:00.000Z");

    await db.insert(cardActivities).values([
      {
        publicId: generateUID(),
        taskInstanceId,
        type: "status_changed",
        oldValue: "pending",
        newValue: "done",
        createdAt: firstDoneAt,
      },
      {
        publicId: generateUID(),
        taskInstanceId,
        type: "status_changed",
        oldValue: "pending",
        newValue: "done",
        createdAt: latestDoneAt,
      },
    ]);

    const result = await backfillTaskInstanceActualDates(db, {
      taskInstanceId,
    });

    const instance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });

    expect(result).toEqual({ matched: 1, updated: 1, skippedNoActivity: 0 });
    expect(instance?.actualDate).toEqual(latestDoneAt);
  });

  it("does not overwrite an already valid actualDate", async () => {
    const targetDate = new Date("2026-08-17T01:00:00.000Z");
    const validActualDate = new Date("2026-08-17T01:45:00.000Z");
    const { taskInstanceId } = await seedTaskInstance({
      status: "done",
      targetDate,
      endDate: new Date("2026-08-17T02:00:00.000Z"),
      actualDate: validActualDate,
    });

    const result = await backfillTaskInstanceActualDates(db, {
      taskInstanceId,
    });
    const instance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });

    expect(result).toEqual({ matched: 0, updated: 0, skippedNoActivity: 0 });
    expect(instance?.actualDate).toEqual(validActualDate);
  });

  it("reports recoverable records without mutating them during dry-run", async () => {
    const targetDate = new Date("2026-08-17T01:00:00.000Z");
    const { taskInstanceId } = await seedTaskInstance({
      status: "done",
      targetDate,
      endDate: new Date("2026-08-17T02:00:00.000Z"),
      actualDate: targetDate,
    });

    await db.insert(cardActivities).values({
      publicId: generateUID(),
      taskInstanceId,
      type: "status_changed",
      oldValue: "pending",
      newValue: "done",
      createdAt: new Date("2026-08-17T01:30:00.000Z"),
    });

    const result = await backfillTaskInstanceActualDates(db, {
      taskInstanceId,
      dryRun: true,
    });
    const instance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });

    expect(result).toEqual({ matched: 1, updated: 0, skippedNoActivity: 0 });
    expect(instance?.actualDate).toEqual(targetDate);
  });
});

describe("getCalendarMetrics", () => {
  it("counts only materialized instances and compares actualDate with endDate", async () => {
    const targetDate = new Date("2026-08-17T01:00:00.000Z");
    const actualDate = new Date("2026-08-17T01:30:00.000Z");
    const endDate = new Date("2026-08-17T02:00:00.000Z");
    const { taskInstanceId } = await seedTaskInstance({
      status: "done",
      targetDate,
      actualDate,
      endDate,
    });
    const instance = await db.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceId),
    });
    const frequency = await db.query.frequences.findFirst();
    if (!instance || !frequency) throw new Error("Test seed failed");
    const virtualOnlyMasterId = randomUUID();

    await db.insert(taskMasters).values({
      id: virtualOnlyMasterId,
      freqId: frequency.id,
      name: "Virtual-only task must not affect KPI",
      startDate: targetDate,
      endDate,
      targetUser: instance.userId,
      createdBy: instance.userId,
    });

    const metrics = await getCalendarMetrics(db, {
      selectedUserId: instance.userId,
      viewMode: "month",
      value: 8,
      year: 2026,
    });

    expect(metrics.taskCompletionRate).toEqual({
      doneCount: 1,
      totalCount: 1,
      rate: 100,
    });
    expect(metrics.deadlineCompletionRate).toEqual({
      onTimeCount: 1,
      totalCount: 1,
      rate: 100,
    });
  });
});
