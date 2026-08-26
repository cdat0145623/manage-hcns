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
import {
  loadPenaltySnapshotsForMasters,
  saveGlobalPenaltyPolicy,
} from "@kan/db/repository/taskPenaltyPolicy.repo";
import { frequences, taskMasters, users } from "@kan/db/schema";

import { startPostgresTestTransaction } from "./postgresTestTransaction";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  throw new Error("POSTGRES_URL is required for task penalty policy tests");
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
afterEach(async () => rollback());
afterAll(async () => pool.end());

async function seedMaster(
  priority: "high" | "medium" | "low" | null,
  overrideAmountVnd: number | null = null,
) {
  const actorId = randomUUID();
  const frequencyId = randomUUID();
  const masterId = randomUUID();
  await db.insert(users).values({
    id: actorId,
    name: "Penalty actor",
    email: `${actorId}@penalty-policy.test`,
    emailVerified: true,
    role: "ADMIN",
  });
  await db.insert(frequences).values({
    id: frequencyId,
    name: "Daily",
    rruleString: "FREQ=DAILY",
    dtStart: new Date("2031-01-01T01:00:00.000Z"),
  });
  await db.insert(taskMasters).values({
    id: masterId,
    freqId: frequencyId,
    name: "Penalty master",
    startDate: new Date("2031-01-01T01:00:00.000Z"),
    endDate: new Date("2031-01-01T02:00:00.000Z"),
    targetUser: actorId,
    createdBy: actorId,
    priority,
    penaltyOverrideAmountVnd: overrideAmountVnd,
  });
  return { actorId, masterId };
}

describe("daily task penalty effective periods", () => {
  it("uses the last saved policy only inside an overlapping period", async () => {
    const { actorId, masterId } = await seedMaster("high");
    await saveGlobalPenaltyPolicy(db, {
      priority: "high",
      amountVnd: 200_000,
      effectiveFrom: new Date("2031-08-01T00:00:00.000Z"),
      effectiveTo: new Date("2031-08-30T23:59:59.999Z"),
      createdBy: actorId,
    });
    await saveGlobalPenaltyPolicy(db, {
      priority: "high",
      amountVnd: 250_000,
      effectiveFrom: new Date("2031-08-15T00:00:00.000Z"),
      effectiveTo: new Date("2031-08-20T23:59:59.999Z"),
      createdBy: actorId,
    });

    const overlap = await loadPenaltySnapshotsForMasters(
      db,
      [{ id: masterId, priority: "high" }],
      new Date("2031-08-18T12:00:00.000Z"),
    );
    const outsideOverlap = await loadPenaltySnapshotsForMasters(
      db,
      [{ id: masterId, priority: "high" }],
      new Date("2031-08-25T12:00:00.000Z"),
    );
    const outsidePeriod = await loadPenaltySnapshotsForMasters(
      db,
      [{ id: masterId, priority: "high" }],
      new Date("2031-08-31T00:00:00.000Z"),
    );

    expect(overlap.get(masterId)).toMatchObject({ amountVnd: 250_000 });
    expect(outsideOverlap.get(masterId)).toMatchObject({ amountVnd: 200_000 });
    expect(outsidePeriod.get(masterId)).toBeNull();
  });

  it("applies a master override only to that master inside the global period", async () => {
    const override = await seedMaster("low", 100_000);
    const defaultMaster = await seedMaster("low");
    await saveGlobalPenaltyPolicy(db, {
      priority: "low",
      amountVnd: 50_000,
      effectiveFrom: new Date("2031-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2031-09-30T23:59:59.999Z"),
      createdBy: override.actorId,
    });

    const snapshots = await loadPenaltySnapshotsForMasters(
      db,
      [
        { id: override.masterId, priority: "low", overrideAmountVnd: 100_000 },
        { id: defaultMaster.masterId, priority: "low" },
      ],
      new Date("2031-09-02T00:00:00.000Z"),
    );

    expect(snapshots.get(override.masterId)).toMatchObject({
      amountVnd: 100_000,
      source: "master_override",
    });
    expect(snapshots.get(defaultMaster.masterId)).toMatchObject({
      amountVnd: 50_000,
      source: "global_policy",
    });
  });
});
