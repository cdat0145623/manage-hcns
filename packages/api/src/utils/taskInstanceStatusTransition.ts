import type { TaskStatus } from "@kan/db/repository/taskInstance.repo";

export function resolveTaskInstanceStatusTransition(params: {
  oldStatus: TaskStatus;
  requestedStatus: TaskStatus;
  currentActualDate: Date | null;
  endDate: Date | null;
  now: Date;
}): { status: TaskStatus; actualDate: Date | null } | null {
  if (params.oldStatus === params.requestedStatus) {
    return {
      status: params.oldStatus,
      actualDate: params.currentActualDate,
    };
  }

  if (params.requestedStatus === "done") {
    return { status: "done", actualDate: params.now };
  }

  if (params.oldStatus === "done" && params.requestedStatus === "pending") {
    const isAfterEndDate =
      params.endDate !== null &&
      params.now.getTime() > params.endDate.getTime();

    return {
      status: isAfterEndDate ? "missed" : "pending",
      actualDate: null,
    };
  }

  return null;
}
