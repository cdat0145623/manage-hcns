import type { TaskPenaltyPriority } from "./penalty-types";
import { penaltyPriorityClass, penaltyPriorityLabel } from "./penalty-formatters";

export function PenaltyPriorityBadge({ priority }: { priority: TaskPenaltyPriority }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${penaltyPriorityClass(priority)}`}>{penaltyPriorityLabel(priority)}</span>;
}
