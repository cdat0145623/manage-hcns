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
import { materializeTaskInstances } from "@kan/db/repository/taskInstanceMaterializer.repo";
import * as schema from "@kan/db/schema";
import { parseCalendarDayInZone } from "@kan/shared/utils";

import { startPostgresTestTransaction } from "./postgresTestTransaction";

const TARGET_DATE = "2026-08-17";
const POSTGRES_URL = process.env.POSTGRES_URL;

if (!POSTGRES_URL) {
  throw new Error(
    "POSTGRES_URL is required for taskInstanceMaterializer integration tests",
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

async function seedDailyTask() {
  const userId = crypto.randomUUID();
  const taskMasterId = crypto.randomUUID();
  const frequencyId = crypto.randomUUID();
  const startDate = new Date("2026-08-17T01:00:00.000Z");
  const endDate = new Date("2026-08-17T02:00:00.000Z");

  await db.insert(schema.users).values({
    id: userId,
    name: "Nguyễn Văn B",
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(schema.frequences).values({
    id: frequencyId,
    name: "Hằng ngày",
    rruleString: "FREQ=DAILY",
    dtStart: startDate,
  });

  await db.insert(schema.taskMasters).values({
    id: taskMasterId,
    freqId: frequencyId,
    name: "Kiểm tra công việc hằng ngày",
    description: "Dữ liệu kiểm thử local",
    startDate,
    endDate,
    targetUser: userId,
    createdBy: userId,
  });

  return { taskMasterId, userId };
}

describe("materializeTaskInstances", () => {
  it("creates one database instance for a scheduled daily occurrence", async () => {
    const { taskMasterId, userId } = await seedDailyTask();

    const result = await materializeTaskInstances(db, {
      date: TARGET_DATE,
      taskMasterId,
      userId,
    });

    const instances = await db.query.taskInstances.findMany({
      where: (table, { eq }) => eq(table.taskMasterId, taskMasterId),
    });

    expect(result).toMatchObject({ created: 1, skipped: 0, failed: 0 });
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      userId,
      taskMasterId,
      status: "pending",
      name: "Kiểm tra công việc hằng ngày",
    });
    expect(instances[0]?.targetDate?.toISOString()).toBe(
      "2026-08-17T01:00:00.000Z",
    );
    expect(instances[0]?.endDate?.toISOString()).toBe(
      "2026-08-17T02:00:00.000Z",
    );
  });

  it("does not create a duplicate when the same date is materialized twice", async () => {
    const { taskMasterId, userId } = await seedDailyTask();

    await materializeTaskInstances(db, {
      date: TARGET_DATE,
      taskMasterId,
      userId,
    });
    const secondRun = await materializeTaskInstances(db, {
      date: TARGET_DATE,
      taskMasterId,
      userId,
    });

    expect(secondRun).toMatchObject({ created: 0, skipped: 1, failed: 0 });
    expect(
      await db.query.taskInstances.findMany({
        where: (table, { eq }) => eq(table.taskMasterId, taskMasterId),
      }),
    ).toHaveLength(1);
  });

  it("supports a dry run without writing instances", async () => {
    const { taskMasterId, userId } = await seedDailyTask();

    const result = await materializeTaskInstances(db, {
      date: TARGET_DATE,
      taskMasterId,
      userId,
      dryRun: true,
    });

    expect(result).toMatchObject({ created: 1, skipped: 0, failed: 0 });
    expect(
      await db.query.taskInstances.findMany({
        where: (table, { eq }) => eq(table.taskMasterId, taskMasterId),
      }),
    ).toHaveLength(0);
  });

  it("uses the Vietnam calendar day when selecting occurrences", () => {
    expect(parseCalendarDayInZone(TARGET_DATE).toISOString()).toBe(
      "2026-08-16T17:00:00.000Z",
    );
  });
});
