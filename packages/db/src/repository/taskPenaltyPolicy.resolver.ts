export const TASK_PENALTY_PRIORITIES = ["high", "medium", "low"] as const;
export type TaskPenaltyPriority = (typeof TASK_PENALTY_PRIORITIES)[number];

export interface PenaltyPolicyView {
  publicId: string;
  priority: TaskPenaltyPriority;
  amountVnd: number;
  source: "system_default" | "global_policy" | "master_override";
  effectiveFrom: Date;
  effectiveTo: Date | null;
  revision?: number;
  supersededAt?: Date | null;
  createdAt?: Date;
}

export interface PenaltySnapshot {
  priority: TaskPenaltyPriority;
  amountVnd: number;
  globalDefaultAmountVnd: number;
  effectiveFrom: Date;
  policyPublicId: string;
  source: "system_default" | "global_policy" | "master_override";
}

export interface GroupedPenaltyPolicy {
  priority: TaskPenaltyPriority;
  current: PenaltyPolicyView | null;
  history: PenaltyPolicyView[];
}

export function resolveGlobalPenaltyPolicyAtDate(
  policies: PenaltyPolicyView[], priority: TaskPenaltyPriority, date: Date,
) {
  return policies
    .filter((p) => p.priority === priority && p.supersededAt === null && p.effectiveFrom <= date && p.effectiveTo !== null && p.effectiveTo >= date)
    .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0) || b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}

export function resolveCurrentGlobalPenaltyPolicy(policies: PenaltyPolicyView[], priority: TaskPenaltyPriority) {
  const newest = (a: PenaltyPolicyView, b: PenaltyPolicyView) =>
    (b.revision ?? 0) - (a.revision ?? 0) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  return policies.filter((p) => p.priority === priority && p.source === "global_policy" && p.supersededAt === null).sort(newest)[0]
    ?? policies.filter((p) => p.priority === priority && p.source === "system_default").sort(newest)[0] ?? null;
}

export function groupPenaltyPolicies(policies: PenaltyPolicyView[], asOf: Date): GroupedPenaltyPolicy[] {
  return TASK_PENALTY_PRIORITIES.map((priority) => {
    const versions = policies.filter((p) => p.priority === priority && p.source !== "system_default");
    const current = versions.filter((p) => p.effectiveFrom <= asOf && p.effectiveTo !== null && p.effectiveTo >= asOf && p.supersededAt == null)
      .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0) || b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
    return { priority, current, history: versions.filter((p) => p.publicId !== current?.publicId).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)) };
  });
}

export function selectPenaltyPolicy(input: {
  priority: TaskPenaltyPriority | null;
  globalPolicy?: { publicId: string; amountVnd: number; effectiveFrom: Date; source?: "system_default" | "global_policy" };
  masterOverrideAmountVnd?: number | null;
}): PenaltySnapshot | null {
  if (!input.priority || !input.globalPolicy) return null;
  const override = input.masterOverrideAmountVnd;
  return {
    priority: input.priority,
    amountVnd: override == null ? input.globalPolicy.amountVnd : override,
    globalDefaultAmountVnd: input.globalPolicy.amountVnd,
    effectiveFrom: input.globalPolicy.effectiveFrom,
    policyPublicId: input.globalPolicy.publicId,
    source: override == null ? input.globalPolicy.source ?? "global_policy" : "master_override",
  };
}
