import type { MemberRole } from "@kan/db/schema";

export type TaskInstanceUpdateAuthorization =
  | "allowed"
  | "forbidden"
  | "task-master-mismatch";

export function getTaskInstanceUpdateAuthorization(params: {
  actorId: string;
  actorRole: MemberRole;
  instanceUserId: string;
  masterCreatedBy: string;
  instanceTaskMasterId: string;
  requestedTaskMasterId: string;
}): TaskInstanceUpdateAuthorization {
  if (params.instanceTaskMasterId !== params.requestedTaskMasterId) {
    return "task-master-mismatch";
  }

  if (
    params.actorRole === "ADMIN" ||
    params.actorId === params.instanceUserId ||
    params.actorId === params.masterCreatedBy
  ) {
    return "allowed";
  }

  return "forbidden";
}
