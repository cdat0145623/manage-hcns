import {
  buildInstantFromAppCalendarDayAndTime,
  parseCalendarDayInZone,
} from "@kan/shared/utils";

export const LOCAL_TEST_WEEKDAYS = [
  { code: "MO", count: 3 },
  { code: "TU", count: 3 },
  { code: "WE", count: 3 },
  { code: "TH", count: 4 },
  { code: "FR", count: 3 },
  { code: "SA", count: 4 },
] as const;

export interface LocalDailyTaskSeedInput {
  count: number;
  userIds: string[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  batchId: string;
}

export interface LocalDailyTaskSeedSpec {
  userId: string;
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  rruleString: string;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const timeToMinutes = (value: string) => {
  const [hours = Number.NaN, minutes = Number.NaN] = value
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
};

export const buildLocalDailyTaskSeedPlan = (
  input: LocalDailyTaskSeedInput,
): LocalDailyTaskSeedSpec[] => {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 100) {
    throw new Error("count must be between 1 and 100");
  }

  if (input.userIds.length === 0) {
    throw new Error("At least one user is required");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error("startDate must use YYYY-MM-DD format");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    throw new Error("endDate must use YYYY-MM-DD format");
  }

  const startDay = parseCalendarDayInZone(input.startDate);
  const endDay = parseCalendarDayInZone(input.endDate);
  if (startDay >= endDay) {
    throw new Error("startDate must be before endDate");
  }

  if (
    !TIME_PATTERN.test(input.startTime) ||
    !TIME_PATTERN.test(input.endTime)
  ) {
    throw new Error("startTime and endTime must use HH:mm format");
  }

  const startMinutes = timeToMinutes(input.startTime);
  const endMinutes = timeToMinutes(input.endTime);
  if (startMinutes >= endMinutes) {
    throw new Error("startTime must be before endTime");
  }

  const availableMinutes = endMinutes - startMinutes;
  const plan: LocalDailyTaskSeedSpec[] = [];
  let taskIndex = 0;

  for (const weekday of LOCAL_TEST_WEEKDAYS) {
    for (let weekdayIndex = 0; weekdayIndex < weekday.count; weekdayIndex++) {
      if (plan.length >= input.count) break;

      const slotOffset = (taskIndex * 30) % Math.max(30, availableMinutes);
      const taskStartMinutes = Math.min(
        startMinutes + slotOffset,
        endMinutes - 30,
      );
      const taskStartTime = `${String(Math.floor(taskStartMinutes / 60)).padStart(2, "0")}:${String(taskStartMinutes % 60).padStart(2, "0")}`;
      const taskEndMinutes = Math.min(taskStartMinutes + 30, endMinutes);
      const taskEndTime = `${String(Math.floor(taskEndMinutes / 60)).padStart(2, "0")}:${String(taskEndMinutes % 60).padStart(2, "0")}`;

      const userId = input.userIds[taskIndex % input.userIds.length];
      if (!userId) throw new Error("At least one user is required");

      plan.push({
        userId,
        name: `[LOCAL-SCHEDULER-TEST:${input.batchId}] Daily task ${taskIndex + 1}`,
        description: input.batchId,
        startDate: buildInstantFromAppCalendarDayAndTime(
          startDay,
          taskStartTime,
        ),
        endDate: buildInstantFromAppCalendarDayAndTime(endDay, taskEndTime),
        rruleString: `FREQ=WEEKLY;BYDAY=${weekday.code}`,
      });

      taskIndex++;
    }
  }

  while (plan.length < input.count) {
    const weekday =
      LOCAL_TEST_WEEKDAYS[plan.length % LOCAL_TEST_WEEKDAYS.length];
    if (!weekday) throw new Error("No weekday configured for local test seed");
    const taskStartTime = input.startTime;
    const taskEndTime = input.endTime;
    const userId = input.userIds[taskIndex % input.userIds.length];
    if (!userId) throw new Error("At least one user is required");

    plan.push({
      userId,
      name: `[LOCAL-SCHEDULER-TEST:${input.batchId}] Daily task ${taskIndex + 1}`,
      description: input.batchId,
      startDate: buildInstantFromAppCalendarDayAndTime(startDay, taskStartTime),
      endDate: buildInstantFromAppCalendarDayAndTime(endDay, taskEndTime),
      rruleString: `FREQ=WEEKLY;BYDAY=${weekday.code}`,
    });
    taskIndex++;
  }

  return plan;
};
