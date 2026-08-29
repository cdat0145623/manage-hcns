import { t } from "@lingui/core/macro";
import {
  addMonths,
  endOfDay,
  endOfMonth,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheckCircle,
  HiChevronLeft,
  HiChevronRight,
  HiExclamationTriangle,
  HiOutlineChartBar,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineXCircle,
  HiXMark,
} from "react-icons/hi2";

import { calendarDateKeyInAppZone } from "@kan/shared/utils";

import type {
  DailyTaskKpiEntry,
  DailyTaskKpiStatus,
  DailyTaskPenaltyPriority,
} from "./daily-task-kpi-utils";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import {
  calculateDailyTaskKpi,
  filterDailyTaskEntries,
  getDailyTaskOccurrenceKey,
  getDailyTaskPeriodBounds,
  getVisibleDailyTaskSelectionState,
  normalizeDailyTaskKpiEntries,
} from "./daily-task-kpi-utils";

type StatusFilter = "all" | DailyTaskKpiStatus | "excluded";

const penaltyLabel: Record<DailyTaskPenaltyPriority, string> = {
  high: t`Cao`,
  medium: t`Trung bình`,
  low: t`Thấp`,
};

const penaltyClassName: Record<DailyTaskPenaltyPriority, string> = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-emerald-100 text-emerald-700",
};

function SummaryItem({
  label,
  value,
  valueClassName = "text-neutral-900 dark:text-white",
  icon,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5">
      <span className="shrink-0">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <span className={`text-base font-bold leading-none ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}

export function DailyTaskKpiPanel({
  embedded = false,
  onClose,
  onBack,
  targetUserId,
}: {
  embedded?: boolean;
  onClose?: () => void;
  onBack?: () => void;
  targetUserId?: string;
}) {
  const { showPopup } = usePopup();
  const { data: currentUser, isLoading: isUserLoading } =
    api.user.getUser.useQuery();
  const [periodMonth, setPeriodMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [fromDate, setFromDate] = useState(
    () => getDailyTaskPeriodBounds(new Date()).from,
  );
  const [toDate, setToDate] = useState(
    () => getDailyTaskPeriodBounds(new Date()).to,
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [savedExcludedKeys, setSavedExcludedKeys] = useState<Set<string>>(
    new Set(),
  );
  const [savedReasons, setSavedReasons] = useState<Record<string, string>>({});
  const [isSelectionDirty, setIsSelectionDirty] = useState(false);
  const selectVisibleEntriesRef = useRef<HTMLInputElement>(null);
  const effectiveTargetUserId = targetUserId ?? currentUser?.id;
  const canManageKpi = currentUser?.role === "ADMIN";
  const periodFrom = calendarDateKeyInAppZone(startOfMonth(periodMonth));
  const periodTo = calendarDateKeyInAppZone(endOfMonth(periodMonth));

  const exclusionsQuery = api.dailyTaskKpi.exclusions.useQuery(
    {
      targetUserId:
        effectiveTargetUserId ?? "00000000-0000-0000-0000-000000000000",
      from: periodFrom,
      to: periodTo,
    },
    { enabled: !!effectiveTargetUserId },
  );
  const virtualTaskQuery = api.taskInstance.getVirtual.useQuery(
    {
      from: startOfDay(fromDate),
      to: endOfDay(toDate),
      targetUser: effectiveTargetUserId,
    },
    { enabled: !!effectiveTargetUserId },
  ) as {
    data: unknown;
    isLoading: boolean;
    isError: boolean;
    refetch: () => Promise<unknown>;
  };
  const { data, isLoading, isError, refetch } = virtualTaskQuery;

  useEffect(() => {
    if (!exclusionsQuery.data) return;

    const nextReasons: Record<string, string> = {};
    const nextKeys = new Set(
      exclusionsQuery.data.map((exclusion) => {
        const key = `${exclusion.taskMasterId}:${exclusion.occurrenceDate}`;
        nextReasons[key] = exclusion.reason;
        return key;
      }),
    );
    setExcludedKeys(nextKeys);
    setReasons(nextReasons);
    setSavedExcludedKeys(nextKeys);
    setSavedReasons(nextReasons);
    setIsSelectionDirty(false);
  }, [exclusionsQuery.data]);

  const entries = useMemo(() => normalizeDailyTaskKpiEntries(data), [data]);
  const rangedEntries = useMemo(
    () =>
      filterDailyTaskEntries(entries, startOfDay(fromDate), endOfDay(toDate)),
    [entries, fromDate, toDate],
  );
  const summary = useMemo(
    () => calculateDailyTaskKpi(rangedEntries, excludedKeys),
    [excludedKeys, rangedEntries],
  );
  const visibleEntries = useMemo(
    () =>
      rangedEntries.filter((entry) => {
        const isExcluded = excludedKeys.has(getDailyTaskOccurrenceKey(entry));
        return (
          statusFilter === "all" ||
          (statusFilter === "excluded" && isExcluded) ||
          (!isExcluded && entry.status === statusFilter)
        );
      }),
    [excludedKeys, rangedEntries, statusFilter],
  );
  const visibleSelectionState = useMemo(
    () => getVisibleDailyTaskSelectionState(visibleEntries, excludedKeys),
    [excludedKeys, visibleEntries],
  );

  useEffect(() => {
    if (!selectVisibleEntriesRef.current) return;
    selectVisibleEntriesRef.current.indeterminate =
      visibleSelectionState.someIncluded && !visibleSelectionState.allIncluded;
  }, [visibleSelectionState]);

  const changeMonth = (offset: number) => {
    const nextMonth =
      offset > 0 ? addMonths(periodMonth, 1) : subMonths(periodMonth, 1);
    setPeriodMonth(nextMonth);
    const bounds = getDailyTaskPeriodBounds(nextMonth);
    setFromDate(bounds.from);
    setToDate(bounds.to);
    setStatusFilter("all");
  };

  const updateFromDate = (value: string) => {
    const next = startOfDay(parseISO(value));
    if (
      Number.isNaN(next.getTime()) ||
      next < startOfMonth(periodMonth) ||
      next > toDate
    )
      return;
    setFromDate(next);
  };

  const updateToDate = (value: string) => {
    const next = endOfDay(parseISO(value));
    if (
      Number.isNaN(next.getTime()) ||
      next > endOfMonth(periodMonth) ||
      next < fromDate
    )
      return;
    setToDate(next);
  };

  const resetDateRange = () => {
    const bounds = getDailyTaskPeriodBounds(periodMonth);
    setFromDate(bounds.from);
    setToDate(bounds.to);
  };

  const toggleEntry = (entry: DailyTaskKpiEntry) => {
    if (!canManageKpi || saveMutation.isPending) return;
    const key = getDailyTaskOccurrenceKey(entry);
    const next = new Set(excludedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExcludedKeys(next);
    setIsSelectionDirty(true);
  };

  const toggleVisibleEntries = (exclude: boolean) => {
    if (!canManageKpi || saveMutation.isPending) return;
    const next = new Set(excludedKeys);
    visibleEntries.forEach((entry) => {
      const key = getDailyTaskOccurrenceKey(entry);
      if (exclude) next.add(key);
      else next.delete(key);
    });
    setExcludedKeys(next);
    setIsSelectionDirty(true);
  };

  const saveMutation = api.dailyTaskKpi.saveChanges.useMutation({
    onSuccess: async () => {
      setSavedExcludedKeys(new Set(excludedKeys));
      setSavedReasons({ ...reasons });
      setIsSelectionDirty(false);
      await exclusionsQuery.refetch();
      showPopup({
        header: t`Đã lưu lựa chọn KPI`,
        message: t`Các task được chọn đã cập nhật cho kỳ KPI này.`,
        icon: "success",
      });
    },
    onError: (error) => {
      showPopup({
        header: t`Không thể lưu lựa chọn KPI`,
        message: error.message,
        icon: "error",
      });
    },
  });

  const saveSelections = () => {
    if (!effectiveTargetUserId || !canManageKpi) return;

    const entriesByKey = new Map(
      entries.map((entry) => [getDailyTaskOccurrenceKey(entry), entry]),
    );
    const exclude = [...excludedKeys].flatMap((key) => {
      const entry = entriesByKey.get(key);
      if (!entry) return [];
      const reasonChanged = reasons[key] !== savedReasons[key];
      if (savedExcludedKeys.has(key) && !reasonChanged) return [];
      return [
        {
          taskMasterId: entry.taskMasterId,
          occurrenceDate: calendarDateKeyInAppZone(entry.targetDate),
          reason: reasons[key],
        },
      ];
    });
    const include = [...savedExcludedKeys].flatMap((key) => {
      if (excludedKeys.has(key)) return [];
      const entry = entriesByKey.get(key);
      return entry
        ? [
            {
              taskMasterId: entry.taskMasterId,
              occurrenceDate: calendarDateKeyInAppZone(entry.targetDate),
            },
          ]
        : [];
    });

    saveMutation.mutate({
      targetUserId: effectiveTargetUserId,
      exclude,
      include,
    });
  };

  const resetSelections = () => {
    setExcludedKeys(new Set(savedExcludedKeys));
    setReasons(savedReasons);
    setIsSelectionDirty(false);
  };

  const hasPendingChanges =
    !exclusionsQuery.isLoading && canManageKpi && isSelectionDirty;

  if (isUserLoading) {
    return (
      <div className="p-8 text-sm text-neutral-500">{t`Loading KPI...`}</div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 flex-col overflow-hidden bg-neutral-50 p-4 dark:bg-neutral-900 sm:p-6"
          : "min-h-full bg-neutral-50 p-4 dark:bg-neutral-900 sm:p-6 lg:p-8"
      }
    >
      <div
        className={
          embedded
            ? "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden"
            : "mx-auto max-w-7xl"
        }
      >
        <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {embedded && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mb-1 rounded-md px-1.5 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-indigo-600 dark:hover:bg-neutral-800 dark:hover:text-indigo-300"
              >
                ← {t`Quản lý công việc`}
              </button>
            )}
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {t`KPI Daily Task`}
              </h1>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                {t`Experimental`}
              </span>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t`Theo dõi tỷ lệ hoàn thành task theo ngày được giao.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
              <button
                type="button"
                aria-label={t`Previous month`}
                onClick={() => changeMonth(-1)}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-indigo-600 dark:hover:bg-neutral-700"
              >
                <HiChevronLeft className="h-5 w-5" />
              </button>
              <span className="min-w-32 text-center text-sm font-bold text-neutral-800 dark:text-white">
                {format(periodMonth, "MM/yyyy")}
              </span>
              <button
                type="button"
                aria-label={t`Next month`}
                onClick={() => changeMonth(1)}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-indigo-600 dark:hover:bg-neutral-700"
              >
                <HiChevronRight className="h-5 w-5" />
              </button>
            </div>
            {embedded && onClose && (
              <button
                type="button"
                aria-label={t`Đóng KPI`}
                onClick={onClose}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-white"
              >
                <HiXMark className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 shrink-0 overflow-x-auto">
          <div className="flex min-w-max items-center divide-x divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-sm dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800">
            <SummaryItem
              label={t`Tổng task`}
              value={summary.total}
              icon={
                <HiOutlineClipboardDocumentList className="h-3.5 w-3.5 text-neutral-400" />
              }
            />
            <SummaryItem
              label={t`Hoàn thành`}
              value={summary.done}
              icon={<HiCheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
              valueClassName="text-emerald-700 dark:text-emerald-300"
            />
            <SummaryItem
              label={t`Đang chờ`}
              value={summary.pending}
              icon={<HiOutlineClock className="h-3.5 w-3.5 text-sky-500" />}
              valueClassName="text-sky-700 dark:text-sky-300"
            />
            <SummaryItem
              label={t`Bỏ lỡ`}
              value={summary.missed}
              icon={
                <HiExclamationTriangle className="h-3.5 w-3.5 text-rose-500" />
              }
              valueClassName="text-rose-700 dark:text-rose-300"
            />
            <SummaryItem
              label={t`Không tính`}
              value={summary.excluded}
              icon={
                <HiOutlineXCircle className="h-3.5 w-3.5 text-neutral-400" />
              }
            />
            <SummaryItem
              label={t`Tỷ lệ`}
              value={`${summary.completionRate}%`}
              icon={
                <HiOutlineChartBar className="h-3.5 w-3.5 text-indigo-500" />
              }
              valueClassName="text-indigo-700 dark:text-indigo-200"
            />
          </div>
        </div>

        <div className="mb-4 shrink-0 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 sm:p-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                {t`Từ ngày`}
                <input
                  type="date"
                  min={format(startOfMonth(periodMonth), "yyyy-MM-dd")}
                  max={format(toDate, "yyyy-MM-dd")}
                  value={format(fromDate, "yyyy-MM-dd")}
                  onChange={(event) => updateFromDate(event.target.value)}
                  className="mt-1 block rounded-lg border border-neutral-200 px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                />
              </label>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                {t`Đến ngày`}
                <input
                  type="date"
                  min={format(fromDate, "yyyy-MM-dd")}
                  max={format(endOfMonth(periodMonth), "yyyy-MM-dd")}
                  value={format(toDate, "yyyy-MM-dd")}
                  onChange={(event) => updateToDate(event.target.value)}
                  className="mt-1 block rounded-lg border border-neutral-200 px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                />
              </label>
              <button
                type="button"
                onClick={resetDateRange}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                {t`Đặt lại thời gian`}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  "all",
                  "done",
                  "pending",
                  "missed",
                  "excluded",
                ] as StatusFilter[]
              ).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${statusFilter === status ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300"}`}
                >
                  {status === "all"
                    ? t`Tất cả`
                    : status === "done"
                      ? t`Hoàn thành`
                      : status === "pending"
                        ? t`Đang chờ`
                        : status === "missed"
                          ? t`Bỏ lỡ`
                          : t`Không tính`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {hasPendingChanges && (
          <div className="mb-4 flex shrink-0 flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <span>{t`Bạn có thay đổi chưa lưu cho kỳ KPI này.`}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetSelections}
                disabled={saveMutation.isPending}
                className="rounded-lg px-3 py-1.5 font-semibold hover:bg-amber-100"
              >
                {t`Đặt lại`}
              </button>
              <button
                type="button"
                onClick={saveSelections}
                disabled={saveMutation.isPending}
                className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
              >
                {saveMutation.isPending ? t`Đang lưu...` : t`Lưu lựa chọn KPI`}
              </button>
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-neutral-500">{t`Loading tasks...`}</div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-rose-600">
              <p>{t`Không thể tải Daily Task.`}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-2 font-semibold underline"
              >{t`Thử lại`}</button>
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">{t`Không có task trong bộ lọc này.`}</div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900/40">
                  <tr>
                    <th className="w-20 px-4 py-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 normal-case">
                        <input
                          ref={selectVisibleEntriesRef}
                          type="checkbox"
                          checked={visibleSelectionState.allIncluded}
                          disabled={!canManageKpi || saveMutation.isPending}
                          onChange={(event) =>
                            toggleVisibleEntries(!event.target.checked)
                          }
                          aria-label={t`Chọn tất cả task đang hiển thị`}
                          className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{t`Chọn`}</span>
                      </label>
                    </th>
                    <th className="px-4 py-3">{t`Task`}</th>
                    <th className="w-32 px-4 py-3">{t`Nhãn phạt`}</th>
                    <th className="w-32 px-4 py-3">{t`Ngày giao`}</th>
                    <th className="w-24 px-4 py-3">{t`Thời gian`}</th>
                    <th className="w-32 px-4 py-3">{t`Trạng thái`}</th>
                    <th className="w-48 px-4 py-3">{t`Lý do loại`}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {visibleEntries.map((entry) => {
                    const key = getDailyTaskOccurrenceKey(entry);
                    const excluded = excludedKeys.has(key);
                    return (
                      <tr
                        key={key}
                        className={
                          excluded
                            ? "bg-neutral-50/70 dark:bg-neutral-900/20"
                            : undefined
                        }
                      >
                        <td className="px-4 py-3">
                          <label className="inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={() => toggleEntry(entry)}
                              disabled={!canManageKpi || saveMutation.isPending}
                              aria-label={
                                excluded
                                  ? t`Tính KPI cho ${entry.name}`
                                  : t`Không tính KPI cho ${entry.name}`
                              }
                              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </label>
                        </td>
                        <td
                          className={`px-4 py-3 font-semibold ${excluded ? "text-neutral-400 line-through" : "text-neutral-900 dark:text-white"}`}
                        >
                          {entry.name}
                        </td>
                        <td className="px-4 py-3">
                          {entry.penaltyPriority ? (
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${penaltyClassName[entry.penaltyPriority]}`}
                            >
                              {penaltyLabel[entry.penaltyPriority]}
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-500">
                              {t`Không gán nhãn`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">
                          {format(entry.targetDate, "dd/MM/yyyy")}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">
                          {format(entry.targetDate, "HH:mm")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.status === "done" ? "bg-emerald-100 text-emerald-700" : entry.status === "missed" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}
                          >
                            {entry.status === "done"
                              ? t`Hoàn thành`
                              : entry.status === "missed"
                                ? t`Bỏ lỡ`
                                : t`Đang chờ`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {excluded && (
                            <input
                              value={reasons[key] ?? ""}
                              disabled={!canManageKpi || saveMutation.isPending}
                              onChange={(event) => {
                                if (!canManageKpi || saveMutation.isPending)
                                  return;
                                setReasons((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }));
                                setIsSelectionDirty(true);
                              }}
                              placeholder={t`Task ngoài phạm vi KPI`}
                              className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DailyTaskKpiView() {
  return <DailyTaskKpiPanel />;
}
