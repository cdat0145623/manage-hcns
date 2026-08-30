import { describe, expect, it } from "vitest";
import { buildTaskMasterAdminUpdateInput, buildTaskMasterCreateInput, buildTaskMasterUpdateInput } from "./task-master-form-model";

describe("task master form model", () => {
  it("builds a typed create payload with shared penalty policy", () => {
    const result = buildTaskMasterCreateInput({ name: "Task", description: "", startDate: new Date(), endDate: new Date(), selectedUserId: "u", rruleString: "FREQ=DAILY", from: new Date(), to: new Date(), priority: "high", amountMode: "override", overrideAmountVnd: 1000 });
    expect(result.penaltyPolicy).toEqual({ priority: "high", amountMode: "override", overrideAmountVnd: 1000 });
  });

  it("preserves the priority change decision for both update contracts", () => {
    const common = { name: "Task", priority: "medium" as const, amountMode: "default" as const, overrideAmountVnd: 0, priorityChangeAction: "use_new_default" as const };
    expect(buildTaskMasterUpdateInput({ id: "id", ...common }).penaltyPolicy).toMatchObject({ priorityChangeAction: "use_new_default" });
    expect(buildTaskMasterAdminUpdateInput({ publicId: "123456789012", ...common }).penaltyPolicy).toMatchObject({ priorityChangeAction: "use_new_default" });
  });
});
