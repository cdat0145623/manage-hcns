import { endOfMonth, startOfMonth } from "date-fns";

import { calendarDateKeyInAppZone } from "@kan/shared/utils";

export type DailyTaskKpiStatus = "pending" | "done" | "missed";
export type DailyTaskPenaltyPriority = "high" | "medium" | "low";

export interface DailyTaskKpiEntry {
  id: string;
  taskMasterId: string;
  name: string;
  targetDate: Date;
  status: DailyTaskKpiStatus;
  penaltyPriority: DailyTaskPenaltyPriority | null;
}

export interface DailyTaskKpiSummary {
  total: number;
  done: number;
  pending: number;
  missed: number;
  excluded: number;
  completionRate: number;
}

export function getDailyTaskPeriodBounds(periodMonth: Date) {
  return {
    from: startOfMonth(periodMonth),
    to: endOfMonth(periodMonth),
  };
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }

  const stringValue = getString(value);
  if (!stringValue) return null;

  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeDailyTaskKpiEntries(
  data: unknown,
): DailyTaskKpiEntry[] {
  if (!Array.isArray(data)) return [];

  return data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const taskMaster = value.taskMaster;
    const taskMasterValue =
      taskMaster && typeof taskMaster === "object"
        ? (taskMaster as Record<string, unknown>)
        : undefined;
    const penalty = value.penalty;
    const penaltyValue =
      penalty && typeof penalty === "object"
        ? (penalty as Record<string, unknown>)
        : undefined;
    const rawPenaltyPriority =
      getString(penaltyValue?.priority) ??
      getString(taskMasterValue?.priority);
    const penaltyPriority: DailyTaskPenaltyPriority | null =
      rawPenaltyPriority === "high" ||
      rawPenaltyPriority === "medium" ||
      rawPenaltyPriority === "low"
        ? rawPenaltyPriority
        : null;
    const targetDate = getDate(value.targetDate);
    const rawStatus = (getString(value.status) ?? "pending").toLowerCase();
    const status: DailyTaskKpiStatus =
      rawStatus === "done" || rawStatus === "missed" ? rawStatus : "pending";
    const taskMasterId =
      getString(value.taskMasterId) ?? getString(value.masterId) ?? "";
    const entryId = getString(value.id);
    const entryName =
      getString(value.name) ?? getString(taskMasterValue?.name) ?? "Daily task";

    if (!taskMasterId || !entryId || !targetDate) return [];

    return [
      {
        id: entryId,
        taskMasterId,
        name: entryName,
        targetDate,
        status,
        penaltyPriority,
      },
    ];
  });
}

export function getDailyTaskOccurrenceKey(
  entry: Pick<DailyTaskKpiEntry, "taskMasterId" | "targetDate">,
) {
  return `${entry.taskMasterId}:${calendarDateKeyInAppZone(entry.targetDate)}`;
}

export function getVisibleDailyTaskSelectionState(
  entries: readonly DailyTaskKpiEntry[],
  excludedKeys: ReadonlySet<string>,
) {
  const includedCount = entries.reduce(
    (count, entry) =>
      excludedKeys.has(getDailyTaskOccurrenceKey(entry)) ? count : count + 1,
    0,
  );

  return {
    allIncluded: entries.length > 0 && includedCount === entries.length,
    someIncluded: includedCount > 0,
  };
}

export function filterDailyTaskEntries(
  entries: readonly DailyTaskKpiEntry[],
  from: Date,
  to: Date,
) {
  const fromTime = from.getTime();
  const toTime = to.getTime();

  return entries.filter((entry) => {
    const targetTime = entry.targetDate.getTime();
    return targetTime >= fromTime && targetTime <= toTime;
  });
}

export function calculateDailyTaskKpi(
  entries: readonly DailyTaskKpiEntry[],
  excludedKeys: ReadonlySet<string>,
): DailyTaskKpiSummary {
  const includedEntries = entries.filter(
    (entry) => !excludedKeys.has(getDailyTaskOccurrenceKey(entry)),
  );
  const done = includedEntries.filter(
    (entry) => entry.status === "done",
  ).length;
  const pending = includedEntries.filter(
    (entry) => entry.status === "pending",
  ).length;
  const missed = includedEntries.filter(
    (entry) => entry.status === "missed",
  ).length;
  const total = includedEntries.length;
  const kpiEligibleTotal = done + missed;

  return {
    total,
    done,
    pending,
    missed,
    excluded: entries.length - total,
    completionRate:
      kpiEligibleTotal === 0
        ? 0
        : Math.round((done / kpiEligibleTotal) * 1000) / 10,
  };
}
