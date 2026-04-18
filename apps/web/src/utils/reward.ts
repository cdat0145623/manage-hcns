import { format } from "date-fns";

export interface CardRewardSnapshot {
  snappedCardTitle: string;
  snappedStartDate: string | Date | null;
  snappedDueDate: string | Date | null;
  snappedTargetUser: string | null;
  snappedBonusAmount: string | number | null;
  snappedCurrency: string;
  snappedDeductions: any[];
}

export interface RewardMismatchResult {
  hasMismatch: boolean;
  violations: {
    type: string;
    description: string;
    field: "title" | "deadline" | "assignee" | "amount" | "deductions";
  }[];
  title: boolean;
  deadline: boolean;
  assignee: boolean;
  amount: boolean;
  deductions: boolean;
  diffDays?: number;
}

/**
 * Common logic to detect if a card has drifted from its approved snapshot.
 */
export const detectRewardMismatch = (
  card: {
    title: string;
    startDate?: Date | string | null;
    dueDate?: Date | string | null;
    assigneeId?: string | null;
    bonusAmount?: string | number | null;
    currency?: string;
    deductions?: any[];
  },
  snapshot: CardRewardSnapshot | null
): RewardMismatchResult => {
  if (!snapshot) {
    return {
      hasMismatch: false,
      violations: [],
      title: false,
      deadline: false,
      assignee: false,
      amount: false,
      deductions: false,
    };
  }

  const violations: RewardMismatchResult["violations"] = [];

  // 1. Title
  const titleMismatch = card.title !== snapshot.snappedCardTitle;
  if (titleMismatch) {
    violations.push({
      type: "title_changed",
      field: "title",
      description: `Tiêu đề thay đổi: "${snapshot.snappedCardTitle}" → "${card.title}"`,
    });
  }

  // 2. Deadline
  const d1 = card.startDate ? new Date(card.startDate).getTime() : null;
  const d2 = snapshot.snappedStartDate ? new Date(snapshot.snappedStartDate).getTime() : null;
  const d3 = card.dueDate ? new Date(card.dueDate).getTime() : null;
  const d4 = snapshot.snappedDueDate ? new Date(snapshot.snappedDueDate).getTime() : null;

  let diffDays = 0;
  if (d3 && d4) {
    diffDays = Math.ceil((d3 - d4) / (1000 * 60 * 60 * 24));
  }

  const deadlineMismatch = d1 !== d2 || d3 !== d4;
  if (deadlineMismatch) {
    violations.push({
      type: "deadline_changed",
      field: "deadline",
      description: diffDays > 0 
        ? `Deadline trễ ${diffDays} ngày`
        : `Timeline thay đổi`,
    });
  }

  // 3. Assignee
  const assigneeMismatch = (card.assigneeId || "") !== (snapshot.snappedTargetUser || "");
  if (assigneeMismatch) {
    violations.push({
      type: "assignee_changed",
      field: "assignee",
      description: `Người thực hiện thay đổi`,
    });
  }

  // 4. Amount
  const amountMismatch =
    Number(card.bonusAmount) !== Number(snapshot.snappedBonusAmount) ||
    card.currency !== snapshot.snappedCurrency;
  if (amountMismatch) {
    violations.push({
      type: "reward_config_changed",
      field: "amount",
      description: `Số tiền thưởng thay đổi`,
    });
  }

  // 5. Deductions (Simplified check for UI)
  const sD = snapshot.snappedDeductions || [];
  const cD = card.deductions || [];
  const deductionsMismatch = sD.length !== cD.length;
  if (deductionsMismatch) {
    violations.push({
      type: "deduction_changed",
      field: "deductions",
      description: `Số lượng mục khấu trừ thay đổi`,
    });
  }

  return {
    hasMismatch: violations.length > 0,
    violations,
    title: titleMismatch,
    deadline: deadlineMismatch,
    assignee: assigneeMismatch,
    amount: amountMismatch,
    deductions: deductionsMismatch,
    diffDays,
  };
};
