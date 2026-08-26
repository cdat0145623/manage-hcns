export type PenaltyPriority = "high" | "medium" | "low";
export type PenaltySource =
  | "system_default"
  | "global_policy"
  | "master_override";

export interface PenaltyPolicyActivityMetadata {
  version: 1;
  effectiveFrom: string;
  priority: PenaltyPriority;
  amountVnd: number;
  source: PenaltySource;
  globalDefaultAmountVnd: number;
  policyPublicId: string;
}

const PRIORITIES = new Set<PenaltyPriority>(["high", "medium", "low"]);
const SOURCES = new Set<PenaltySource>([
  "system_default",
  "global_policy",
  "master_override",
]);

export const parsePenaltyPolicyActivityMetadata = (
  metadata: unknown,
): PenaltyPolicyActivityMetadata | null => {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata as Record<string, unknown>;
  if (
    value.version !== 1 ||
    typeof value.effectiveFrom !== "string" ||
    typeof value.priority !== "string" ||
    !PRIORITIES.has(value.priority as PenaltyPriority) ||
    typeof value.amountVnd !== "number" ||
    typeof value.source !== "string" ||
    !SOURCES.has(value.source as PenaltySource) ||
    typeof value.globalDefaultAmountVnd !== "number" ||
    typeof value.policyPublicId !== "string"
  ) {
    return null;
  }

  return value as unknown as PenaltyPolicyActivityMetadata;
};
