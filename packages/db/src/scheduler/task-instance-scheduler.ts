import { CALENDAR_TIME_ZONE } from "@kan/shared/utils";

export const MATERIALIZE_SCHEDULE = "0 7 * * *";
export const MISSED_STATUS_SCHEDULE = "*/15 * * * *";

interface ScheduledTask {
  stop: () => void | Promise<void>;
}

type Schedule = (
  expression: string,
  callback: () => void,
  options: { timezone: string },
) => ScheduledTask;

interface RegisterTaskInstanceSchedulerOptions {
  schedule: Schedule;
  materializeToday: () => void | Promise<void>;
  updateMissedNow: () => void | Promise<void>;
  currentHour: number;
}

const preventOverlap = (job: () => void | Promise<void>) => {
  let isRunning = false;

  return async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      await job();
    } finally {
      isRunning = false;
    }
  };
};

export async function registerTaskInstanceScheduler(
  options: RegisterTaskInstanceSchedulerOptions,
): Promise<ScheduledTask[]> {
  const runMaterialize = preventOverlap(options.materializeToday);
  const runMissedUpdate = preventOverlap(options.updateMissedNow);

  if (options.currentHour >= 7) {
    await runMaterialize();
  }
  await runMissedUpdate();

  return [
    options.schedule(MATERIALIZE_SCHEDULE, () => void runMaterialize(), {
      timezone: CALENDAR_TIME_ZONE,
    }),
    options.schedule(MISSED_STATUS_SCHEDULE, () => void runMissedUpdate(), {
      timezone: CALENDAR_TIME_ZONE,
    }),
  ];
}
