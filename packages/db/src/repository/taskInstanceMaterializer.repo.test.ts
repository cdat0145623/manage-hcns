import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { taskMasters } from "@kan/db/schema";

import {
  buildTaskMasterMaterializationConditions,
} from "./taskInstanceMaterializer.repo";
import { generateVirtualTaskInstances } from "./taskInstance.repo";

describe("buildTaskMasterMaterializationConditions", () => {
  it("does not use occurrence dates to exclude an active recurring task master", () => {
    const conditions = buildTaskMasterMaterializationConditions(taskMasters, {
      taskMasterId: "master-id",
      userId: "user-id",
    });
    const combined = and(...conditions);
    expect(combined).toBeDefined();
    if (!combined) return;

    const query = new PgDialect().sqlToQuery(combined);

    expect(query.sql).toContain('"isDeleted"');
    expect(query.sql).toContain('"id"');
    expect(query.sql).toContain('"targetUser"');
    expect(query.sql).not.toContain('"startDate"');
    expect(query.sql).not.toContain('"endDate"');
  });

  it("generates an occurrence from an old master on the requested recurring day", async () => {
    const occurrences = await generateVirtualTaskInstances({
      userId: "user-id",
      taskMasterId: "master-id",
      rruleString: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA",
      startDate: new Date("2026-07-10T08:00:00+07:00"),
      masterEndDate: new Date("2026-07-10T08:30:00+07:00"),
      from: new Date("2026-08-19T00:00:00+07:00"),
      to: new Date("2026-08-19T23:59:59+07:00"),
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.targetDate.toISOString()).toBe(
      "2026-08-19T01:00:00.000Z",
    );
    expect(occurrences[0]?.endDate.toISOString()).toBe(
      "2026-08-19T01:30:00.000Z",
    );
  });

  it("does not generate an occurrence after an RRULE UNTIL date", async () => {
    const occurrences = await generateVirtualTaskInstances({
      userId: "user-id",
      taskMasterId: "master-id",
      rruleString:
        "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA;UNTIL=20260818T235959Z",
      startDate: new Date("2026-07-10T08:00:00+07:00"),
      masterEndDate: new Date("2026-07-10T08:30:00+07:00"),
      from: new Date("2026-08-19T00:00:00+07:00"),
      to: new Date("2026-08-19T23:59:59+07:00"),
    });

    expect(occurrences).toHaveLength(0);
  });
});
