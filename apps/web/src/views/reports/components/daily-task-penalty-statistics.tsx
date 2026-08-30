import { t } from "@lingui/core/macro";
import { useMemo, useState } from "react";
import { HiCurrencyDollar } from "react-icons/hi2";
import { PenaltyPriorityBadge } from "~/views/daily-task-penalty/PenaltyPriorityBadge";
import { formatPenaltyVnd, penaltyPriorityClass, penaltyPriorityLabel } from "~/views/daily-task-penalty/penalty-formatters";

type Priority = "high" | "medium" | "low";
type Source = "common" | "custom";

interface PenaltyEntry {
  taskMasterPublicId: string | null;
  taskName: string | null;
  targetDate: Date;
  createdAt: Date;
  priority: Priority;
  source: Source;
  amountVnd: number;
}

interface PenaltyTotal {
  count: number;
  amountVnd: number;
}

interface DailyTaskPenaltyStatisticsProps {
  entries: PenaltyEntry[];
  total: PenaltyTotal;
}

const priorityFilters: Priority[] = ["high", "medium", "low"];

export function DailyTaskPenaltyStatistics({
  entries,
  total,
}: DailyTaskPenaltyStatisticsProps) {
  const [activePriority, setActivePriority] = useState<Priority | null>(null);
  const visibleEntries = useMemo(
    () =>
      activePriority
        ? entries.filter((entry) => entry.priority === activePriority)
        : entries,
    [activePriority, entries],
  );
  const visibleTotal = useMemo<PenaltyTotal>(() => {
    if (!activePriority) return total;

    return visibleEntries.reduce<PenaltyTotal>(
      (summary, entry) => ({
        count: summary.count + 1,
        amountVnd: summary.amountVnd + entry.amountVnd,
      }),
      { count: 0, amountVnd: 0 },
    );
  }, [activePriority, total, visibleEntries]);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          {t`Lọc theo nhãn`}
        </p>
        <div className="flex flex-wrap gap-2">
          {priorityFilters.map((priority) => {
            const isActive = activePriority === priority;
            return (
              <button
                key={priority}
                type="button"
                aria-pressed={isActive}
                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm"
                    : `${penaltyPriorityClass(priority)} hover:brightness-95`
                }`}
                onClick={() =>
                  setActivePriority((current) =>
                    current === priority ? null : priority,
                  )
                }
              >
                {penaltyPriorityLabel(priority)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-light-200 dark:border-dark-400">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-light-50 text-left text-xs font-bold uppercase tracking-wide text-neutral-700 dark:bg-dark-300 dark:text-dark-1000">
            <tr>
              <th className="px-4 py-3">{t`Công việc lặp lại`}</th>
              <th className="px-4 py-3">{t`Ngày tạo`}</th>
              <th className="px-4 py-3">{t`Độ ưu tiên`}</th>
              <th className="px-4 py-3 text-right">{t`Tổng khấu trừ`}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-light-200 dark:divide-dark-400">
            {visibleEntries.map((entry) => (
              <tr
                key={`${entry.taskMasterPublicId ?? entry.taskName ?? "task"}-${entry.targetDate.toISOString()}`}
              >
                <td className="max-w-[360px] px-4 py-3 font-medium text-light-1000 dark:text-dark-1000">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="truncate">
                      {entry.taskName ?? t`Không tên`}
                    </span>
                    {entry.source === "custom" && (
                      <HiCurrencyDollar
                        className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300"
                        aria-label={t`Mức khấu trừ riêng`}
                        title={t`Mức khấu trừ riêng`}
                      />
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-700 dark:text-dark-1000">
                  {entry.createdAt.toLocaleDateString("vi-VN")}
                </td>
                <td className="px-4 py-3">
                  <PenaltyPriorityBadge priority={entry.priority} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-light-1000 dark:text-dark-1000">
                  {formatPenaltyVnd(entry.amountVnd)}
                </td>
              </tr>
            ))}
            {visibleEntries.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-sm text-light-500"
                >
                  {activePriority
                    ? t`Không có task bị khấu trừ với nhãn này`
                    : t`Chưa có khoản khấu trừ trong khoảng thời gian này`}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-light-200 bg-light-50 dark:border-dark-400 dark:bg-dark-300">
            <tr>
              <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-700 dark:text-dark-1000">
                {t`Tổng bộ lọc`}
              </td>
              <td />
              <td className="px-4 py-3 text-sm font-semibold text-neutral-700 dark:text-dark-1000">
                {visibleTotal.count} {t`task bị khấu trừ`}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-light-1000 dark:text-dark-1000">
                {formatPenaltyVnd(visibleTotal.amountVnd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
        <HiCurrencyDollar className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
        {t`Mức khấu trừ riêng cho task này. Task không có ký hiệu dùng mức khấu trừ chung của nhãn.`}
      </p>
    </div>
  );
}
