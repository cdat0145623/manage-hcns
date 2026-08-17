import { createDrizzleClient } from "../client";
import { backfillTaskInstanceActualDates } from "../repository/taskInstanceStatus.repo";

const readOption = (name: string) => {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
};

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const readDateOption = (name: string) => {
  const value = readOption(name);
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be a valid ISO date-time`);
  }

  return date;
};

const db = createDrizzleClient();

try {
  const result = await backfillTaskInstanceActualDates(db, {
    dryRun: hasFlag("dry-run"),
    userId: readOption("user-id"),
    taskInstanceId: readOption("task-instance-id"),
    from: readDateOption("from"),
    to: readDateOption("to"),
  });

  process.stdout.write(
    `${JSON.stringify(
      {
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
