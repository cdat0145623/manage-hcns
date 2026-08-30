import { t } from "@lingui/core/macro";
import { TASK_PENALTY_PRIORITIES } from "./penalty-types";
import type { PenaltyAmountMode, TaskPenaltyPriority } from "./penalty-types";
import { penaltyPriorityClass, penaltyPriorityLabel } from "./penalty-formatters";

interface TaskPenaltyPolicyFieldsProps {
  priority: TaskPenaltyPriority | null;
  amountMode: PenaltyAmountMode;
  overrideAmount: string;
  onPriorityChange: (priority: TaskPenaltyPriority | null) => void;
  onAmountModeChange: (mode: PenaltyAmountMode) => void;
  onOverrideAmountChange: (value: string) => void;
  priorityOnly?: boolean;
}

export function TaskPenaltyPolicyFields({ priority, amountMode, overrideAmount, onPriorityChange, onAmountModeChange, onOverrideAmountChange, priorityOnly = false }: TaskPenaltyPolicyFieldsProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{t`Mức phạt`}</legend>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`rounded-full px-3 py-1.5 text-xs font-bold ${!priority ? "bg-neutral-700 text-white" : "bg-neutral-100"}`} onClick={() => onPriorityChange(null)}>{t`Không áp dụng`}</button>
        {TASK_PENALTY_PRIORITIES.map((item) => <button key={item} type="button" aria-pressed={priority === item} className={`rounded-full px-3 py-1.5 text-xs font-bold ${priority === item ? "ring-2 ring-indigo-500" : penaltyPriorityClass(item)}`} onClick={() => onPriorityChange(item)}>{penaltyPriorityLabel(item)}</button>)}
      </div>
      {!priorityOnly && priority && <div className="flex items-center gap-3 text-sm">
        <label><input type="radio" checked={amountMode === "default"} onChange={() => onAmountModeChange("default")} /> {t`Mặc định`}</label>
        <label><input type="radio" checked={amountMode === "override"} onChange={() => onAmountModeChange("override")} /> {t`Riêng`}</label>
        {amountMode === "override" && <input aria-label={t`Mức phạt riêng`} value={overrideAmount} onChange={(event) => onOverrideAmountChange(event.target.value)} inputMode="numeric" className="w-32 rounded border px-2 py-1" />}
      </div>}
    </fieldset>
  );
}
