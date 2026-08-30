import { useCallback, useState } from "react";
import { isKpiSelectionDirty, resetKpiSelection, toggleKpiOccurrence, type DailyTaskKpiSelectionState } from "./daily-task-kpi-selection";

export function useDailyTaskKpiSelection(initial: DailyTaskKpiSelectionState) {
  const [state, setState] = useState(initial);
  const toggle = useCallback((key: string) => setState((current) => toggleKpiOccurrence(current, key)), []);
  const reset = useCallback(() => setState((current) => resetKpiSelection(current)), []);
  return {
    state,
    setState,
    toggle,
    reset,
    isDirty: isKpiSelectionDirty(state),
    excludedKeys: state.excludedKeys,
    reasons: state.reasons,
    savedExcludedKeys: state.savedExcludedKeys,
    savedReasons: state.savedReasons,
  };
}
