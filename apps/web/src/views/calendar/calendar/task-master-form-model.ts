import { buildTaskPenaltyPolicy } from "~/views/daily-task-penalty/penalty-types";
import type { PenaltyAmountMode, TaskPenaltyPriority } from "~/views/daily-task-penalty/penalty-types";
import type { RouterInputs } from "~/utils/api";

interface PenaltyArgs { priority: TaskPenaltyPriority | null; amountMode: PenaltyAmountMode; overrideAmountVnd: number; priorityChangeAction?: "keep_override" | "use_new_default"; penaltyTouched?: boolean }
export const buildPenaltyInput = ({ priority, amountMode, overrideAmountVnd }: PenaltyArgs) => buildTaskPenaltyPolicy(priority, amountMode, overrideAmountVnd);

export function buildTaskMasterCreateInput(input: Omit<RouterInputs["taskMaster"]["create"], "penaltyPolicy"> & PenaltyArgs): RouterInputs["taskMaster"]["create"] {
  const { priority, amountMode, overrideAmountVnd, priorityChangeAction: _priorityChangeAction, penaltyTouched: _penaltyTouched, ...rest } = input;
  return { ...rest, penaltyPolicy: buildPenaltyInput({ priority, amountMode, overrideAmountVnd }) };
}

export function buildTaskMasterUpdateInput(input: Omit<RouterInputs["taskMaster"]["update"], "penaltyPolicy"> & PenaltyArgs): RouterInputs["taskMaster"]["update"] {
  const { priority, amountMode, overrideAmountVnd, priorityChangeAction, penaltyTouched = true, ...rest } = input;
  return { ...rest, penaltyPolicy: penaltyTouched ? { policy: buildPenaltyInput({ priority, amountMode, overrideAmountVnd }), priorityChangeAction } : undefined };
}

export function buildTaskMasterAdminUpdateInput(input: Omit<RouterInputs["taskMaster"]["updateAdmin"], "penaltyPolicy"> & PenaltyArgs): RouterInputs["taskMaster"]["updateAdmin"] {
  const { priority, amountMode, overrideAmountVnd, priorityChangeAction, penaltyTouched = true, ...rest } = input;
  return { ...rest, penaltyPolicy: penaltyTouched ? { policy: buildPenaltyInput({ priority, amountMode, overrideAmountVnd }), priorityChangeAction } : undefined };
}
