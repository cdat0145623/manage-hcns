import { CALENDAR_TIME_ZONE } from "@kan/shared/utils";

export const MATERIALIZE_SCHEDULE = "0 7 * * *";
export const MISSED_STATUS_SCHEDULE = "5,20,35,50 8-23 * * *";

const MATERIALIZE_START_MINUTES = 7 * 60;
const MISSED_STATUS_START_MINUTES = 8 * 60 + 5;

export interface ScheduledTask {
  stop: () => void | Promise<void>;
}

export type Schedule = (
  expression: string,
  callback: () => void,
  options: { timezone: string },
) => ScheduledTask;

interface RegisterTaskInstanceSchedulerOptions {
  schedule: Schedule;
  materializeToday: () => void | Promise<void>;
  updateMissedNow: () => void | Promise<void>;
  currentMinutesOfDay: number;
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

  if (options.currentMinutesOfDay >= MATERIALIZE_START_MINUTES) {
    await runMaterialize();
  }
  if (options.currentMinutesOfDay >= MISSED_STATUS_START_MINUTES) {
    await runMissedUpdate();
  }

  return [
    options.schedule(MATERIALIZE_SCHEDULE, () => void runMaterialize(), {
      timezone: CALENDAR_TIME_ZONE,
    }),
    options.schedule(MISSED_STATUS_SCHEDULE, () => void runMissedUpdate(), {
      timezone: CALENDAR_TIME_ZONE,
    }),
  ];
}
