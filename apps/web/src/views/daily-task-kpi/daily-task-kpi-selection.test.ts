import { describe, expect, it } from "vitest";
import { buildKpiSelectionChanges, hydrateKpiSelection, isKpiSelectionDirty, resetKpiSelection, toggleKpiOccurrence, toggleVisibleKpiOccurrences } from "./daily-task-kpi-selection";

describe("daily task KPI selection", () => {
  it("hydrates and resets immutable draft state", () => {
    const state = hydrateKpiSelection([{ key: "a", taskMasterId: "m", occurrenceDate: "2026-08-01", reason: "x" }]);
    const changed = toggleKpiOccurrence(state, "a");
    expect(isKpiSelectionDirty(changed)).toBe(true);
    expect(resetKpiSelection(changed).excludedKeys).toEqual(new Set(["a"]));
  });

  it("emits exact include/exclude changes, including reason-only edits", () => {
    const state = hydrateKpiSelection([{ key: "a", taskMasterId: "m", occurrenceDate: "2026-08-01", reason: "old" }, { key: "b", taskMasterId: "m", occurrenceDate: "2026-08-02" }]);
    const changed = { ...state, reasons: { ...state.reasons, a: "new" }, excludedKeys: new Set(["a"]) };
    expect(buildKpiSelectionChanges(changed, [
      { key: "a", taskMasterId: "m", occurrenceDate: "2026-08-01" },
      { key: "b", taskMasterId: "m", occurrenceDate: "2026-08-02" },
    ])).toEqual({ exclude: [{ taskMasterId: "m", occurrenceDate: "2026-08-01", reason: "new" }], include: [{ taskMasterId: "m", occurrenceDate: "2026-08-02" }] });
  });

  it("supports visible bulk toggles and reset without mutating saved state", () => {
    const state = hydrateKpiSelection([]);
    const excluded = toggleVisibleKpiOccurrences(state, ["a", "b"], true);
    expect(excluded.excludedKeys).toEqual(new Set(["a", "b"]));
    expect(isKpiSelectionDirty(excluded)).toBe(true);
    const included = toggleVisibleKpiOccurrences(excluded, ["a"], false);
    expect(included.excludedKeys).toEqual(new Set(["b"]));
    expect(resetKpiSelection(included).excludedKeys).toEqual(new Set());
  });
});
