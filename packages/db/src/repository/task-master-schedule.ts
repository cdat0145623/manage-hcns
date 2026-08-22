import {
  applyMasterWallTimeToAnchorDay,
  calendarDateKeyInAppZone,
  diffCalendarDaysInAppZone,
} from "@kan/shared/utils";

export interface PendingInstanceSchedule {
  id: string;
  targetDate: Date;
  endDate: Date | null;
}

export interface DesiredPendingSchedule {
  targetDate: Date;
  endDate: Date;
}

export interface PendingInstanceScheduleUpdate extends DesiredPendingSchedule {
  id: string;
}

export interface PendingInstanceReconciliation {
  updates: PendingInstanceScheduleUpdate[];
  archives: string[];
  creates: DesiredPendingSchedule[];
  retainedPending: number;
}

interface MaterializedInstanceKey {
  id: string;
  targetDate: Date | null;
  status: "pending" | "done" | "missed";
  isDeleted: boolean;
}

export const getArchivedPendingInstanceIdsBlockingSchedules = (params: {
  materialized: MaterializedInstanceKey[];
  schedules: { targetDate: Date }[];
}): string[] => {
  const scheduleTargetTimes = new Set(
    params.schedules.map((schedule) => schedule.targetDate.getTime()),
  );

  return params.materialized.flatMap((instance) =>
    instance.isDeleted &&
    instance.status === "pending" &&
    instance.targetDate &&
    scheduleTargetTimes.has(instance.targetDate.getTime())
      ? [instance.id]
      : [],
  );
};

const IGNORED_RRULE_PARTS = new Set([
  "DTSTART",
  "BYHOUR",
  "BYMINUTE",
  "BYSECOND",
  "TZID",
]);

const normalizeRecurrenceCadence = (rruleString: string): string => {
  const normalized = rruleString.replace(/\\n/g, "\n");
  const ruleLine =
    normalized
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("RRULE:")) ?? normalized;
  const ruleBody = ruleLine.replace(/^RRULE:/, "");

  return ruleBody
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.split("=")[0]?.split(":").at(-1)?.toUpperCase();
      return key ? !IGNORED_RRULE_PARTS.has(key) : false;
    })
    .map((part) => part.replace(/^TZID=[^:]+:/i, ""))
    .sort()
    .join(";");
};

export const hasSameRecurrenceCadence = (
  oldRruleString: string,
  newRruleString: string,
): boolean =>
  normalizeRecurrenceCadence(oldRruleString) ===
  normalizeRecurrenceCadence(newRruleString);

export const buildScheduleOnAnchorDay = (
  anchor: Date,
  masterStartDate: Date,
  masterEndDate: Date,
): DesiredPendingSchedule => {
  const targetDate = applyMasterWallTimeToAnchorDay(anchor, masterStartDate);
  const sameDayEnd = applyMasterWallTimeToAnchorDay(anchor, masterEndDate);
  const configuredDaySpan = Math.max(
    0,
    diffCalendarDaysInAppZone(masterEndDate, masterStartDate),
  );
  const inferredDaySpan = sameDayEnd <= targetDate ? 1 : 0;
  const daySpan = Math.max(configuredDaySpan, inferredDaySpan);
  const endDate = new Date(
    sameDayEnd.getTime() + daySpan * 24 * 60 * 60 * 1000,
  );

  return { targetDate, endDate };
};

export const buildPendingInstanceReconciliation = (params: {
  cadenceChanged: boolean;
  existing: PendingInstanceSchedule[];
  desired: DesiredPendingSchedule[];
  occupiedTargetDates?: Date[];
  newMasterStartDate: Date;
  newMasterEndDate: Date;
}): PendingInstanceReconciliation => {
  if (!params.cadenceChanged) {
    return {
      updates: params.existing.map((instance) => ({
        id: instance.id,
        ...buildScheduleOnAnchorDay(
          instance.targetDate,
          params.newMasterStartDate,
          params.newMasterEndDate,
        ),
      })),
      archives: [],
      creates: [],
      retainedPending: params.existing.length,
    };
  }

  const existingByCalendarDay = new Map(
    params.existing.map((instance) => [
      calendarDateKeyInAppZone(instance.targetDate),
      instance,
    ]),
  );
  const desiredCalendarDays = new Set(
    params.desired.map((schedule) =>
      calendarDateKeyInAppZone(schedule.targetDate),
    ),
  );
  const occupiedCalendarDays = new Set(
    (params.occupiedTargetDates ?? []).map(calendarDateKeyInAppZone),
  );
  const updates: PendingInstanceScheduleUpdate[] = [];
  const creates: DesiredPendingSchedule[] = [];

  for (const schedule of params.desired) {
    const scheduleDay = calendarDateKeyInAppZone(schedule.targetDate);
    if (occupiedCalendarDays.has(scheduleDay)) continue;
    const matching = existingByCalendarDay.get(scheduleDay);
    if (matching) {
      updates.push({ id: matching.id, ...schedule });
    } else {
      creates.push(schedule);
    }
  }

  return {
    updates,
    archives: params.existing
      .filter(
        (instance) =>
          !desiredCalendarDays.has(
            calendarDateKeyInAppZone(instance.targetDate),
          ),
      )
      .map((instance) => instance.id),
    creates,
    retainedPending: updates.length,
  };
};
