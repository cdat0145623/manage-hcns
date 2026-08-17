import { createDrizzleClient } from "../client";
import { markOverdueTaskInstancesMissed } from "../repository/taskInstanceStatus.repo";

const readOption = (name: string) => {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
};

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const nowOption = readOption("now");
const now = nowOption ? new Date(nowOption) : new Date();

if (Number.isNaN(now.getTime())) {
  throw new Error("now must be a valid ISO date-time");
}

const db = createDrizzleClient();

try {
  const result = await markOverdueTaskInstancesMissed(db, {
    now,
    dryRun: hasFlag("dry-run"),
    userId: readOption("user-id"),
    taskInstanceId: readOption("task-instance-id"),
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        now: now.toISOString(),
        dryRun: hasFlag("dry-run"),
        ...result,
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await db.$client?.end();
}
