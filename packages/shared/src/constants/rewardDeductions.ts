/**
 * Khấu trừ thưởng — chỉ 2 loại (lưu trong card_reward_deductions.reason, không đổi schema).
 * - late_deadline: hoàn thành trễ so với deadline
 * - deadline_move: xin dời deadline — admin quyết khi duyệt có áp mức khấu trừ này hay không
 */
export const REWARD_DEDUCTION_REASON = {
  LATE: "late_deadline",
  MOVE: "deadline_move",
} as const;

export type RewardDeductionReasonKey =
  (typeof REWARD_DEDUCTION_REASON)[keyof typeof REWARD_DEDUCTION_REASON];

export const REWARD_DEDUCTION_REASON_VALUES: RewardDeductionReasonKey[] = [
  REWARD_DEDUCTION_REASON.LATE,
  REWARD_DEDUCTION_REASON.MOVE,
];

export function isRewardDeductionReasonKey(
  s: string,
): s is RewardDeductionReasonKey {
  return (REWARD_DEDUCTION_REASON_VALUES as string[]).includes(s);
}
