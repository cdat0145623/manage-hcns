import type { AuthSessionStatus } from "~/providers/auth-session";

interface CanUpdateTaskStatusInput {
  canEdit: boolean;
  isBusy: boolean;
  sessionStatus: AuthSessionStatus;
}

interface CanExtendMissedTaskInput {
  isAdmin: boolean;
  isBusy: boolean;
  sessionStatus: AuthSessionStatus;
}

export function canUpdateTaskStatus(input: CanUpdateTaskStatusInput): boolean {
  return (
    input.canEdit && !input.isBusy && input.sessionStatus === "authenticated"
  );
}

export function canExtendMissedTask(input: CanExtendMissedTaskInput): boolean {
  return (
    input.isAdmin && !input.isBusy && input.sessionStatus === "authenticated"
  );
}
