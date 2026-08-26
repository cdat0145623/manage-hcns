import { endOfMonth, startOfMonth } from "date-fns";

export type DailyTaskKpiStatus = "pending" | "done" | "missed";

export interface DailyTaskKpiEntry {
  id: string;
  taskMasterId: string;
  name: string;
  targetDate: Date;
  status: DailyTaskKpiStatus;
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

    return [{ id: entryId, taskMasterId, name: entryName, targetDate, status }];
  });
}

export function getDailyTaskOccurrenceKey(
  entry: Pick<DailyTaskKpiEntry, "taskMasterId" | "targetDate">,
) {
  return `${entry.taskMasterId}:${entry.targetDate.toISOString()}`;
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

  return {
    total,
    done,
    pending,
    missed,
    excluded: entries.length - total,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 1000) / 10,
  };
}
