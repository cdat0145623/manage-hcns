import type { UserRole } from "@kan/db/repository/user.repo";

export const canUpdateTaskMaster = (params: {
  actorId: string;
  actorRole: UserRole;
  createdBy: string;
  targetUser: string;
}): boolean =>
  params.actorRole === "ADMIN" ||
  params.actorId === params.createdBy ||
  params.actorId === params.targetUser;
