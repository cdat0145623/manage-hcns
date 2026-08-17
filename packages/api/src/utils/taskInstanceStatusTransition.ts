import type { TaskStatus } from "@kan/db/repository/taskInstance.repo";

export function isAllowedUserTaskInstanceStatusTransition(params: {
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
}): boolean {
  if (params.oldStatus === params.newStatus) return true;
  if (params.newStatus === "done") return true;
  return params.oldStatus === "done" && params.newStatus === "pending";
}

export function resolveActualDateForStatusTransition(params: {
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  currentActualDate: Date | null;
  now: Date;
}): Date | null {
  if (params.oldStatus === params.newStatus) {
    return params.currentActualDate;
  }

  if (params.newStatus === "done") {
    return params.now;
  }

  if (params.oldStatus === "done" && params.newStatus === "pending") {
    return null;
  }

  return params.currentActualDate;
}
