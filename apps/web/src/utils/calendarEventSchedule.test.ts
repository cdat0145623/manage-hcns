import { describe, expect, it } from "vitest";

import { generateRRuleString } from "@kan/shared/utils";

import {
  buildCalendarEventSchedule,
  getCalendarEffectiveDate,
  inferCalendarRecurrenceType,
} from "./calendarEventSchedule";

describe("buildCalendarEventSchedule", () => {
  it("stores Vietnam 09:00 as 02:00 UTC", () => {
    const schedule = buildCalendarEventSchedule(
      new Date("2026-08-24T00:00:00+07:00"),
      "09:00",
      "10:00",
    );

    expect(schedule.startDate.toISOString()).toBe("2026-08-24T02:00:00.000Z");
    expect(schedule.endDate.toISOString()).toBe("2026-08-24T03:00:00.000Z");
  });

  it("moves an overnight end time to the next calendar day", () => {
    const schedule = buildCalendarEventSchedule(
      new Date("2026-08-24T00:00:00+07:00"),
      "22:00",
      "01:00",
    );

    expect(schedule.startDate.toISOString()).toBe("2026-08-24T15:00:00.000Z");
    expect(schedule.endDate.toISOString()).toBe("2026-08-24T18:00:00.000Z");
  });
});

describe("getCalendarEffectiveDate", () => {
  it("returns the selected occurrence day in the app timezone", () => {
    expect(getCalendarEffectiveDate("2026-08-24T18:00:00.000Z")).toBe(
      "2026-08-25",
    );
  });
});

describe("inferCalendarRecurrenceType", () => {
  it.each([
    ["FREQ=WEEKLY;BYDAY=MO", "WEEKLY"],
    ["FREQ=WEEKLY;BYDAY=MO,WE,FR", "CUSTOM"],
    ["FREQ=MONTHLY;BYMONTHDAY=24", "MONTHLY_DATE"],
    ["FREQ=MONTHLY;BYDAY=MO;BYSETPOS=4", "MONTHLY_DAY"],
  ] as const)("maps %s to %s", (rruleString, expected) => {
    expect(inferCalendarRecurrenceType(rruleString)).toBe(expected);
  });
});

describe("daily recurrence round trip", () => {
  it("generates and infers a daily rule without converting it to monthly", () => {
    const rule = generateRRuleString({
      type: "daily",
      startTime: "09:00",
      startDate: new Date("2026-08-24T02:00:00.000Z"),
    });

    expect(rule).toContain("FREQ=DAILY");
    expect(inferCalendarRecurrenceType(rule)).toBe("DAILY");
  });
});
