import { schedule } from "node-cron";

import {
  CALENDAR_TIME_ZONE,
  calendarDateKeyInAppZone,
  formatInAppCalendarZone,
} from "@kan/shared/utils";

import { createDrizzleClient } from "../client";
import { materializeTaskInstances } from "../repository/taskInstanceMaterializer.repo";
import { markOverdueTaskInstancesMissed } from "../repository/taskInstanceStatus.repo";
import { registerTaskInstanceScheduler } from "../scheduler/task-instance-scheduler";

const db = createDrizzleClient();

const runForToday = async () => {
  try {
    const result = await materializeTaskInstances(db, {
      date: calendarDateKeyInAppZone(new Date()),
    });
    process.stdout.write(
      `[task-instance-scheduler] ${JSON.stringify(result)}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[task-instance-scheduler] ${message}\n`);
  }
};

const updateMissedForNow = async () => {
  try {
    const result = await markOverdueTaskInstancesMissed(db, {
      now: new Date(),
    });
    process.stdout.write(
      `[task-instance-status-scheduler] ${JSON.stringify(result)}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[task-instance-status-scheduler] ${message}\n`);
  }
};

const currentHour = Number(formatInAppCalendarZone(new Date(), "H"));
const scheduledTasks = await registerTaskInstanceScheduler({
  schedule,
  materializeToday: runForToday,
  updateMissedNow: updateMissedForNow,
  currentHour,
});

process.stdout.write(
  `[task-instance-scheduler] registered timezone=${CALENDAR_TIME_ZONE}\n`,
);

const shutdown = async () => {
  await Promise.all(scheduledTasks.map((task) => task.stop()));
  await db.$client?.end();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
