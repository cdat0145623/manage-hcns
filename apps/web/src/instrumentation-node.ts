import { attachDatabasePool } from "@vercel/functions";

import { getPostgresPool } from "@kan/db/client";
import { startTaskInstanceScheduler } from "@kan/db/scheduler/task-instance-scheduler-runtime";

type PostgresPool = NonNullable<ReturnType<typeof getPostgresPool>>;
type AttachDatabasePool = (pool: PostgresPool) => void;

let isDatabasePoolAttached = false;

export function registerDatabasePool(
  pool: PostgresPool | null,
  attach: AttachDatabasePool = attachDatabasePool,
) {
  if (!pool || isDatabasePoolAttached) return;

  attach(pool);
  isDatabasePoolAttached = true;
}

export async function registerTaskInstanceScheduler() {
  // eslint-disable-next-line no-restricted-properties
  if (process.env.VERCEL === "1") {
    registerDatabasePool(getPostgresPool());
  }

  await startTaskInstanceScheduler();
}
