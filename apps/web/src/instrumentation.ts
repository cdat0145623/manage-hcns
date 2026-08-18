interface SchedulerRuntimeEnvironment {
  nodeEnv: string | undefined;
  nextRuntime: string | undefined;
}

export const shouldStartTaskInstanceScheduler = ({
  nodeEnv,
  nextRuntime,
}: SchedulerRuntimeEnvironment) =>
  nodeEnv === "production" && nextRuntime === "nodejs";

export async function register() {
  // This direct runtime branch lets Next.js exclude Node-only scheduler imports
  // from the Edge instrumentation bundle.
  // eslint-disable-next-line no-restricted-properties, turbo/no-undeclared-env-vars
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (
    !shouldStartTaskInstanceScheduler({
      // Next.js owns both variables for this server lifecycle hook.
      // eslint-disable-next-line no-restricted-properties
      nodeEnv: process.env.NODE_ENV,
      nextRuntime: "nodejs",
    })
  ) {
    return;
  }

  const { registerTaskInstanceScheduler } = await import(
    "./instrumentation-node"
  );
  await registerTaskInstanceScheduler();
}
