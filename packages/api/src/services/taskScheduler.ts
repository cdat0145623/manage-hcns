/**
 * Pure computation service — no DB calls.
 * Expands a list of TaskMasters into virtual task occurrences
 * within a given date range.
 */

import type { RecurrenceRule } from "@kan/db/schema";

export interface MaterializedInstance {
  id: number;
  publicId: string;
  targetDate: Date;
  status: "pending" | "in_progress" | "done" | "skipped";
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  cardId: number | null;
}
export interface TaskMasterInput {
  id: number;
  publicId: string;
  title: string;
  description: string | null;
  recurrenceRule: RecurrenceRule;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  instances: MaterializedInstance[];
}

export interface VirtualTask {
  masterId: number;
  masterPublicId: string;
  title: string;
  description: string | null;
  targetDate: Date;
  /** "HH:mm" or null */
  defaultStartTime: string | null;
  /** "HH:mm" or null */
  defaultEndTime: string | null;
  /** null if not yet materialized in DB */
  instance: MaterializedInstance | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a copy of `date` with time zeroed-out (local time) */
const toDateOnly = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** True if two dates share the same calendar day */
const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Returns the date of the nth occurrence of a weekday in a given month.
 * Example: week=1, dayOfWeek=1 → first Monday of month.
 * Returns null if the occurrence doesn't exist.
 */
const getNthWeekdayOfMonth = (
  year: number,
  month: number,
  week: number,
  dayOfWeek: number,
): Date | null => {
  // Start from the 1st of the month
  const first = new Date(year, month, 1);
  const firstDow = first.getDay(); // 0=Sun

  // Offset to first occurrence of dayOfWeek
  let offset = dayOfWeek - firstDow;
  if (offset < 0) offset += 7;

  // Add (week - 1) * 7 days for the nth week
  const day = 1 + offset + (week - 1) * 7;
  // Check the resulting date is still within the same month
  const result = new Date(year, month, day);
  if (result.getMonth() !== month) return null;
  return result;
};

// ---------------------------------------------------------------------------
// Core expansion logic
// ---------------------------------------------------------------------------

/**
 * Given a list of active TaskMasters and a date range, returns all
 * virtual task occurrences (already merged with materialized instances).
 */
export const expandVirtualTasks = (
  masters: TaskMasterInput[],
  fromDate: Date,
  toDate: Date,
): VirtualTask[] => {
  const from = toDateOnly(fromDate);
  const to = toDateOnly(toDate);
  const results: VirtualTask[] = [];

  for (const master of masters) {
    const rule = master.recurrenceRule;

    const occurrences: Date[] = [];

    if (rule.type === "weekly") {
      // Walk day by day
      const cursor = new Date(from);
      while (cursor <= to) {
        if (rule.daysOfWeek.includes(cursor.getDay())) {
          occurrences.push(new Date(cursor));
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (rule.type === "monthly_weekday") {
      // Walk month by month
      const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);

      while (cursor <= endMonth) {
        const occurrence = getNthWeekdayOfMonth(
          cursor.getFullYear(),
          cursor.getMonth(),
          rule.week,
          rule.dayOfWeek,
        );

        if (occurrence && occurrence >= from && occurrence <= to) {
          occurrences.push(occurrence);
        }

        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      // Walk month by month
      const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);

      while (cursor <= endMonth) {
        const candidate = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          rule.dayOfMonth,
        );

        // If dayOfMonth overflows the month (e.g., Feb 31), getDate() will
        // differ — skip those
        if (
          candidate.getDate() === rule.dayOfMonth &&
          candidate >= from &&
          candidate <= to
        ) {
          occurrences.push(candidate);
        }

        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    for (const targetDate of occurrences) {
      const instance =
        master.instances.find((inst) =>
          isSameDay(inst.targetDate, targetDate),
        ) ?? null;

      results.push({
        masterId: master.id,
        masterPublicId: master.publicId,
        title: master.title,
        description: master.description,
        targetDate,
        defaultStartTime: master.defaultStartTime,
        defaultEndTime: master.defaultEndTime,
        instance,
      });
    }
  }

  // Sort chronologically
  results.sort((a, b) => a.targetDate.getTime() - b.targetDate.getTime());

  return results;
};
