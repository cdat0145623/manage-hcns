import { isSameDay } from "date-fns";

import { REWARD_DEDUCTION_REASON } from "@kan/shared/constants";

const DEDUCTION_REASON_SORT: Record<string, number> = {
  [REWARD_DEDUCTION_REASON.LATE]: 0,
  [REWARD_DEDUCTION_REASON.MOVE]: 1,
};

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
  snapshot: CardRewardSnapshot | null,
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

  const numClose = (a: unknown, b: unknown) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) && Number.isNaN(nb)) return true;
    if (Number.isNaN(na) || Number.isNaN(nb)) return false;
    return Math.abs(na - nb) < 0.005;
  };

  const dateAligned = (
    a: Date | string | null | undefined,
    b: Date | string | null | undefined,
  ) => {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return isSameDay(new Date(a), new Date(b));
  };

  // 1. Title
  const titleMismatch =
    (card.title ?? "").trim() !== (snapshot.snappedCardTitle ?? "").trim();
  if (titleMismatch) {
    violations.push({
      type: "title_changed",
      field: "title",
      description: `Tiêu đề thay đổi: "${snapshot.snappedCardTitle}" → "${card.title}"`,
    });
  }

  // 2. Deadline (so sánh theo cùng ngày — tránh lệch timezone/ms)
  const d1 = card.startDate ? new Date(card.startDate).getTime() : null;
  const d2 = snapshot.snappedStartDate
    ? new Date(snapshot.snappedStartDate).getTime()
    : null;
  const d3 = card.dueDate ? new Date(card.dueDate).getTime() : null;
  const d4 = snapshot.snappedDueDate
    ? new Date(snapshot.snappedDueDate).getTime()
    : null;

  let diffDays = 0;
  if (d3 && d4) {
    diffDays = Math.ceil((d3 - d4) / (1000 * 60 * 60 * 24));
  }

  const deadlineMismatch =
    !dateAligned(card.startDate, snapshot.snappedStartDate) ||
    !dateAligned(card.dueDate, snapshot.snappedDueDate);
  if (deadlineMismatch) {
    violations.push({
      type: "deadline_changed",
      field: "deadline",
      description:
        diffDays > 0 ? `Deadline trễ ${diffDays} ngày` : `Timeline thay đổi`,
    });
  }

  // 3. Assignee
  const assigneeMismatch =
    (card.assigneeId || "") !== (snapshot.snappedTargetUser || "");
  if (assigneeMismatch) {
    violations.push({
      type: "assignee_changed",
      field: "assignee",
      description: `Người thực hiện thay đổi`,
    });
  }

  // 4. Amount
  const amountMismatch =
    !numClose(card.bonusAmount, snapshot.snappedBonusAmount) ||
    String(card.currency ?? "").trim() !==
      String(snapshot.snappedCurrency ?? "").trim();
  if (amountMismatch) {
    violations.push({
      type: "reward_config_changed",
      field: "amount",
      description: `Số tiền thưởng thay đổi`,
    });
  }

  // 5. Deductions — so khớp nội dung, không chỉ độ dài
  type DedRow = { reason: string; unitType: string; value: string };
  const norm = (rows: unknown[]): DedRow[] =>
    (rows as DedRow[])
      .map((r) => ({
        reason: String(r?.reason ?? "").trim(),
        unitType: String(r?.unitType ?? ""),
        value: String(r?.value ?? "").trim(),
      }))
      .sort((a, b) => {
        const oa = DEDUCTION_REASON_SORT[a.reason] ?? 99;
        const ob = DEDUCTION_REASON_SORT[b.reason] ?? 99;
        if (oa !== ob) return oa - ob;
        return `${a.reason}|${a.unitType}|${a.value}`.localeCompare(
          `${b.reason}|${b.unitType}|${b.value}`,
        );
      });
  const sD = norm(snapshot.snappedDeductions || []);
  const cD = norm(card.deductions || []);
  const deductionsMismatch =
    sD.length !== cD.length ||
    sD.some(
      (row, i) =>
        row.reason !== cD[i]?.reason ||
        row.unitType !== cD[i]?.unitType ||
        row.value !== cD[i]?.value,
    );
  if (deductionsMismatch) {
    violations.push({
      type: "deduction_changed",
      field: "deductions",
      description: `Danh mục khấu trừ thay đổi`,
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

/** Tổng khấu trừ (VND) từ logs đã duyệt — cùng logic với finalize ở API. */
export function totalDeductionVndFromApprovedLogs(
  logs: Array<{
    violationType: string;
    isSkipped: boolean;
    deduction?: {
      unitType: "percent" | "vnd";
      value: string | number;
    } | null;
  }>,
  baseBonus: number,
): number {
  let total = 0;
  for (const log of logs) {
    if (log.violationType === "finalization_created") continue;
    if (log.isSkipped || !log.deduction) continue;
    const v = Number(log.deduction.value);
    if (Number.isNaN(v)) continue;
    if (log.deduction.unitType === "vnd") total += v;
    else total += baseBonus * (v / 100);
  }
  return total;
}
