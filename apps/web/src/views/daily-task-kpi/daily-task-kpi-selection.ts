export interface DailyTaskKpiSelectionState {
  excludedKeys: Set<string>;
  reasons: Record<string, string>;
  savedExcludedKeys: Set<string>;
  savedReasons: Record<string, string>;
}

export interface DailyTaskKpiOccurrenceInput {
  key: string;
  taskMasterId: string;
  occurrenceDate: string;
  reason?: string;
}

export function hydrateKpiSelection(exclusions: DailyTaskKpiOccurrenceInput[]): DailyTaskKpiSelectionState {
  const excludedKeys = new Set(exclusions.map((item) => item.key));
  const reasons = Object.fromEntries(exclusions.flatMap((item) => item.reason ? [[item.key, item.reason] as const] : []));
  return { excludedKeys, reasons, savedExcludedKeys: new Set(excludedKeys), savedReasons: { ...reasons } };
}

export function toggleKpiOccurrence(state: DailyTaskKpiSelectionState, key: string): DailyTaskKpiSelectionState {
  const excludedKeys = new Set(state.excludedKeys);
  if (excludedKeys.has(key)) excludedKeys.delete(key);
  else excludedKeys.add(key);
  return { ...state, excludedKeys };
}

export function toggleVisibleKpiOccurrences(state: DailyTaskKpiSelectionState, keys: string[], exclude: boolean): DailyTaskKpiSelectionState {
  const excludedKeys = new Set(state.excludedKeys);
  keys.forEach((key) => (exclude ? excludedKeys.add(key) : excludedKeys.delete(key)));
  return { ...state, excludedKeys };
}

export function resetKpiSelection(state: DailyTaskKpiSelectionState): DailyTaskKpiSelectionState {
  return { ...state, excludedKeys: new Set(state.savedExcludedKeys), reasons: { ...state.savedReasons } };
}

export function isKpiSelectionDirty(state: DailyTaskKpiSelectionState) {
  if (state.excludedKeys.size !== state.savedExcludedKeys.size) return true;
  for (const key of state.excludedKeys) if (!state.savedExcludedKeys.has(key) || state.reasons[key] !== state.savedReasons[key]) return true;
  return false;
}

export function buildKpiSelectionChanges(
  state: DailyTaskKpiSelectionState,
  entries: DailyTaskKpiOccurrenceInput[],
) {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const exclude = [...state.excludedKeys].flatMap((key) => {
    const entry = byKey.get(key);
    if (!entry || (state.savedExcludedKeys.has(key) && state.reasons[key] === state.savedReasons[key])) return [];
    return [{ taskMasterId: entry.taskMasterId, occurrenceDate: entry.occurrenceDate, reason: state.reasons[key] }];
  });
  const include = [...state.savedExcludedKeys].flatMap((key) => {
    const entry = byKey.get(key);
    return !state.excludedKeys.has(key) && entry ? [{ taskMasterId: entry.taskMasterId, occurrenceDate: entry.occurrenceDate }] : [];
  });
  return { exclude, include };
}
