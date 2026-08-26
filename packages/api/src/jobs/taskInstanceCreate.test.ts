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
import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import {
  cardActivities,
  frequences,
  taskInstances,
  taskMasters,
  users,
} from "@kan/db/schema";

import { startPostgresTestTransaction } from "./postgresTestTransaction";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  throw new Error("POSTGRES_URL is required for task instance create tests");
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

async function seedMaster(priority: "high" | "medium" | "low" | null = null) {
  const userId = randomUUID();
  const frequencyId = randomUUID();
  const taskMasterId = randomUUID();
  const targetDate = new Date("2031-04-10T01:00:00.000Z");

  await db.insert(users).values({
    id: userId,
    name: "Task instance test actor",
    email: `${userId}@task-instance.test`,
    emailVerified: true,
    role: "ADMIN",
  });
  await db.insert(frequences).values({
    id: frequencyId,
    name: "Daily test frequency",
    rruleString: "FREQ=DAILY",
    dtStart: targetDate,
  });
  await db.insert(taskMasters).values({
    id: taskMasterId,
    freqId: frequencyId,
    name: "Daily task",
    description: "Created by scheduler or calendar click",
    startDate: targetDate,
    endDate: new Date("2031-04-10T02:00:00.000Z"),
    targetUser: userId,
    createdBy: userId,
    priority,
  });

  return { userId, taskMasterId, targetDate };
}

describe("task instance creation", () => {
  it("returns the materialized occurrence when a virtual entry is clicked", async () => {
    const { userId, taskMasterId, targetDate } = await seedMaster();
    const input = {
      userId,
      taskMasterId,
      name: "Daily task",
      description: "Created by scheduler or calendar click",
      targetDate,
      actualDate: null,
      endDate: new Date("2031-04-10T02:00:00.000Z"),
      status: "pending" as const,
    };

    const materialized = await taskInstanceRepo.create(db, input);
    const clickedVirtualEntry = await taskInstanceRepo.create(db, input);

    expect(clickedVirtualEntry.id).toBe(materialized.id);
    const occurrences = await db.query.taskInstances.findMany({
      where: (table, { eq }) => eq(table.taskMasterId, taskMasterId),
    });
    expect(occurrences).toHaveLength(1);
  });

  it("records the penalty policy applied to a newly materialized instance", async () => {
    const { userId, taskMasterId, targetDate } = await seedMaster("low");

    const materialized = await taskInstanceRepo.create(db, {
      userId,
      taskMasterId,
      name: "Daily task",
      description: "Created by scheduler or calendar click",
      targetDate,
      actualDate: null,
      endDate: new Date("2031-04-10T02:00:00.000Z"),
      status: "pending",
    });

    const activities = await db.query.cardActivities.findMany({
      where: (table, { eq }) => eq(table.taskInstanceId, materialized.id),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    });

    expect(activities.map((activity) => activity.type)).toEqual([
      "created",
      "penalty_policy_applied",
    ]);
    expect(activities[1]).toMatchObject({
      metadata: {
        version: 1,
        priority: "low",
        amountVnd: 50_000,
        source: "system_default",
        globalDefaultAmountVnd: 50_000,
      },
    });
  });
});
