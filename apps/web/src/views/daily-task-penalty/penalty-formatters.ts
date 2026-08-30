import { t } from "@lingui/core/macro";
import type { TaskPenaltyPriority } from "./penalty-types";

export const formatPenaltyVnd = (amount: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);

export const penaltyPriorityLabel = (priority: TaskPenaltyPriority) =>
  priority === "high" ? t`Cao` : priority === "medium" ? t`Trung bình` : t`Thấp`;

export const penaltyPriorityClass = (priority: TaskPenaltyPriority) =>
  priority === "high"
    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
    : priority === "medium"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
