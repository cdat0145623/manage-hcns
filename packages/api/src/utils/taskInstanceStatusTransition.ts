import type { TaskStatus } from "@kan/db/repository/taskInstance.repo";
import { applyMasterWallTimeToAnchorDay } from "@kan/shared/utils";

export function resolveTaskInstanceEndDate(params: {
  storedEndDate: Date | null;
  storedTargetDate: Date;
  requestedTargetDate: Date | undefined;
  masterEndDate: Date;
}): Date {
  const targetDateIsUnchanged =
    params.requestedTargetDate === undefined ||
    params.requestedTargetDate.getTime() === params.storedTargetDate.getTime();

  if (targetDateIsUnchanged && params.storedEndDate) {
    return params.storedEndDate;
  }

  return applyMasterWallTimeToAnchorDay(
    params.requestedTargetDate ?? params.storedTargetDate,
    params.masterEndDate,
  );
}

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

  if (params.oldStatus === "missed") {
    return null;
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
