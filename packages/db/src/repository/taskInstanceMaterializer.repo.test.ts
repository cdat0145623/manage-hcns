import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { taskMasters } from "@kan/db/schema";

import { generateVirtualTaskInstances } from "./taskInstance.repo";
import { buildTaskMasterMaterializationConditions } from "./taskInstanceMaterializer.repo";

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

  it("keeps a DTSTART wall-clock time stable when the process timezone is UTC", async () => {
    const occurrences = await generateVirtualTaskInstances({
      userId: "user-id",
      taskMasterId: "master-id",
      rruleString:
        "DTSTART;TZID=Asia/Ho_Chi_Minh:20260822T030000\\nRRULE:FREQ=WEEKLY;BYDAY=SA",
      startDate: new Date("2026-08-22T03:00:00.000Z"),
      masterEndDate: new Date("2026-08-22T04:00:00.000Z"),
      from: new Date("2026-08-21T17:00:00.000Z"),
      to: new Date("2026-08-22T16:59:59.999Z"),
    });

    expect(occurrences[0]?.targetDate.toISOString()).toBe(
      "2026-08-22T03:00:00.000Z",
    );
    expect(occurrences[0]?.endDate.toISOString()).toBe(
      "2026-08-22T04:00:00.000Z",
    );
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

  it("treats an RRULE without TZID as a Vietnam calendar rule", async () => {
    const occurrences = await generateVirtualTaskInstances({
      userId: "user-id",
      taskMasterId: "master-id",
      rruleString: "FREQ=WEEKLY;BYDAY=MO",
      startDate: new Date("2026-08-24T01:00:00+07:00"),
      masterEndDate: new Date("2026-08-24T02:00:00+07:00"),
      from: new Date("2026-08-24T00:00:00+07:00"),
      to: new Date("2026-08-24T23:59:59+07:00"),
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.targetDate.toISOString()).toBe(
      "2026-08-23T18:00:00.000Z",
    );
  });

  it("does not generate an occurrence after an RRULE UNTIL date", async () => {
    const occurrences = await generateVirtualTaskInstances({
      userId: "user-id",
      taskMasterId: "master-id",
      rruleString: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA;UNTIL=20260818T235959Z",
      startDate: new Date("2026-07-10T08:00:00+07:00"),
      masterEndDate: new Date("2026-07-10T08:30:00+07:00"),
      from: new Date("2026-08-19T00:00:00+07:00"),
      to: new Date("2026-08-19T23:59:59+07:00"),
    });

    expect(occurrences).toHaveLength(0);
  });

  it("materializes an overnight task with its end on the next calendar day", async () => {
    const occurrences = await generateVirtualTaskInstances({
      userId: "user-id",
      taskMasterId: "master-id",
      rruleString: "FREQ=WEEKLY;BYDAY=MO",
      startDate: new Date("2026-08-24T22:00:00+07:00"),
      masterEndDate: new Date("2026-08-25T01:00:00+07:00"),
      from: new Date("2026-08-24T00:00:00+07:00"),
      to: new Date("2026-08-24T23:59:59+07:00"),
    });

    expect(occurrences[0]?.targetDate.toISOString()).toBe(
      "2026-08-24T15:00:00.000Z",
    );
    expect(occurrences[0]?.endDate.toISOString()).toBe(
      "2026-08-24T18:00:00.000Z",
    );
  });
});
