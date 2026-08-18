import { CALENDAR_TIME_ZONE } from "@kan/shared/utils";

import { startTaskInstanceScheduler } from "../scheduler/task-instance-scheduler-runtime";

const scheduler = await startTaskInstanceScheduler();

process.stdout.write(
  `[task-instance-scheduler] registered timezone=${CALENDAR_TIME_ZONE}\n`,
);

const shutdown = async () => {
  await scheduler.stop();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
