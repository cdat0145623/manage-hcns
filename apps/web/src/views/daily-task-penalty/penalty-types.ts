export const TASK_PENALTY_PRIORITIES = ["high", "medium", "low"] as const;
export type TaskPenaltyPriority = (typeof TASK_PENALTY_PRIORITIES)[number];
export type PenaltyAmountMode = "default" | "override";

export type TaskPenaltyPolicy =
  | { priority: null }
  | { priority: TaskPenaltyPriority; amountMode: "default" }
  | {
      priority: TaskPenaltyPriority;
      amountMode: "override";
      overrideAmountVnd: number;
    };

export function buildTaskPenaltyPolicy(
  priority: TaskPenaltyPriority | null,
  amountMode: PenaltyAmountMode,
  overrideAmountVnd: number,
): TaskPenaltyPolicy {
  if (!priority) return { priority: null };
  if (amountMode === "override") {
    return { priority, amountMode, overrideAmountVnd };
  }
  return { priority, amountMode };
}
