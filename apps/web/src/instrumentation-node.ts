import { startTaskInstanceScheduler } from "@kan/db/scheduler/task-instance-scheduler-runtime";

export async function registerTaskInstanceScheduler() {
  await startTaskInstanceScheduler();
}
