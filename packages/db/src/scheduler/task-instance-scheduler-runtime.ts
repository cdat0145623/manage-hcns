import { schedule } from "node-cron";

import { createLogger } from "@kan/logger";
import {
  CALENDAR_TIME_ZONE,
  calendarDateKeyInAppZone,
  formatInAppCalendarZone,
} from "@kan/shared/utils";

import type { Schedule } from "./task-instance-scheduler";
import { createDrizzleClient } from "../client";
import { materializeTaskInstances } from "../repository/taskInstanceMaterializer.repo";
import { markOverdueTaskInstancesMissed } from "../repository/taskInstanceStatus.repo";
import {
  MATERIALIZE_SCHEDULE,
  MISSED_STATUS_SCHEDULE,
  registerTaskInstanceScheduler,
} from "./task-instance-scheduler";

const logger = createLogger("task-instance-scheduler");

export interface TaskInstanceSchedulerHandle {
  stop: () => Promise<void>;
}

interface TaskInstanceSchedulerStarterDependencies {
  schedule: Schedule;
  now: () => Date;
  materializeToday: () => void | Promise<void>;
  updateMissedNow: () => void | Promise<void>;
  close: () => void | Promise<void>;
  onRegistered: () => void;
}

const minutesOfDayInAppZone = (date: Date) => {
  const hour = Number(formatInAppCalendarZone(date, "H"));
  const minute = Number(formatInAppCalendarZone(date, "m"));
  return hour * 60 + minute;
};

export function createTaskInstanceSchedulerStarter(
  dependencies: TaskInstanceSchedulerStarterDependencies,
): () => Promise<TaskInstanceSchedulerHandle> {
  let startPromise: Promise<TaskInstanceSchedulerHandle> | undefined;

  return () => {
    startPromise ??= (async () => {
      const now = dependencies.now();
      const scheduledTasks = await registerTaskInstanceScheduler({
        schedule: dependencies.schedule,
        materializeToday: dependencies.materializeToday,
        updateMissedNow: dependencies.updateMissedNow,
        currentMinutesOfDay: minutesOfDayInAppZone(now),
      });
      dependencies.onRegistered();
      let stopped = false;

      return {
        stop: async () => {
          if (stopped) return;
          stopped = true;
          await Promise.all(scheduledTasks.map((task) => task.stop()));
          await dependencies.close();
        },
      };
    })().catch((error: unknown) => {
      startPromise = undefined;
      throw error;
    });

    return startPromise;
  };
}

let startProductionScheduler:
  | (() => Promise<TaskInstanceSchedulerHandle>)
  | undefined;

export function startTaskInstanceScheduler(): Promise<TaskInstanceSchedulerHandle> {
  if (!startProductionScheduler) {
    const db = createDrizzleClient();

    const materializeToday = async () => {
      try {
        const result = await materializeTaskInstances(db, {
          date: calendarDateKeyInAppZone(new Date()),
        });
        logger.info({ result }, "Daily task instances materialized");
      } catch (error) {
        logger.error({ error }, "Failed to materialize daily task instances");
      }
    };

    const updateMissedNow = async () => {
      try {
        const result = await markOverdueTaskInstancesMissed(db, {
          now: new Date(),
        });
        logger.info({ result }, "Overdue task instances evaluated");
      } catch (error) {
        logger.error({ error }, "Failed to evaluate overdue task instances");
      }
    };

    startProductionScheduler = createTaskInstanceSchedulerStarter({
      schedule,
      now: () => new Date(),
      materializeToday,
      updateMissedNow,
      close: async () => db.$client?.end(),
      onRegistered: () =>
        logger.info(
          {
            timezone: CALENDAR_TIME_ZONE,
            materializeSchedule: MATERIALIZE_SCHEDULE,
            missedStatusSchedule: MISSED_STATUS_SCHEDULE,
          },
          "Task instance scheduler registered",
        ),
    });
  }

  return startProductionScheduler();
}
