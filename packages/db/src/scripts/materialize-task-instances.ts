import { createDrizzleClient } from "../client";
import { materializeTaskInstances } from "../repository/taskInstanceMaterializer.repo";

const readOption = (name: string) => {
  const prefix = `--${name}=`;
  const argument = process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length);
};

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const date = readOption("date") ?? new Date();
const taskMasterId = readOption("task-master-id");
const userId = readOption("user-id");
const dryRun = hasFlag("dry-run");

const db = createDrizzleClient();

try {
  const result = await materializeTaskInstances(db, {
    date,
    taskMasterId,
    userId,
    dryRun,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        date: date instanceof Date ? date.toISOString() : date,
        dryRun,
        ...result,
      },
      null,
      2,
    )}\n`,
  );

  if (result.failed > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await db.$client?.end();
}
