export type TaskInstanceStatus = "pending" | "done" | "missed";

export function getOptimisticTaskStatus(
  currentStatus: TaskInstanceStatus,
  requestedStatus: TaskInstanceStatus,
): TaskInstanceStatus | null {
  if (currentStatus !== "done" && requestedStatus === "done") {
    return "done";
  }

  return null;
}
