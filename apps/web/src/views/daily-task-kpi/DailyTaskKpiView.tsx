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
import { useEffect, useMemo, useState } from "react";
import {
  HiCheckCircle,
  HiChevronLeft,
  HiChevronRight,
  HiExclamationTriangle,
  HiOutlineCalendarDays,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineXCircle,
  HiXMark,
} from "react-icons/hi2";

import type {
  DailyTaskKpiEntry,
  DailyTaskKpiStatus,
} from "./daily-task-kpi-utils";
import { api } from "~/utils/api";
import {
  calculateDailyTaskKpi,
  filterDailyTaskEntries,
  getDailyTaskOccurrenceKey,
  getDailyTaskPeriodBounds,
  normalizeDailyTaskKpiEntries,
} from "./daily-task-kpi-utils";

type StatusFilter = "all" | DailyTaskKpiStatus | "excluded";

const STORAGE_VERSION = "v1";

function getStorageKey(userId: string, from: Date, to: Date) {
  return `daily-task-kpi:${STORAGE_VERSION}:${userId}:${format(from, "yyyy-MM-dd")}:${format(to, "yyyy-MM-dd")}`;
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <div
        className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}
      >
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

export function DailyTaskKpiPanel({
  embedded = false,
  onClose,
  targetUserId,
}: {
  embedded?: boolean;
  onClose?: () => void;
  targetUserId?: string;
}) {
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
  const [isLoadedFromStorage, setIsLoadedFromStorage] = useState(false);
  const [isSelectionDirty, setIsSelectionDirty] = useState(false);
  const effectiveTargetUserId = targetUserId ?? currentUser?.id;

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

  const storageKey = effectiveTargetUserId
    ? getStorageKey(effectiveTargetUserId, periodMonth, endOfMonth(periodMonth))
    : null;

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;

    try {
      const saved: unknown = JSON.parse(
        window.localStorage.getItem(storageKey) ?? "{}",
      );
      const savedValue =
        saved && typeof saved === "object"
          ? (saved as Record<string, unknown>)
          : {};
      const excludedValues = savedValue.excludedKeys;
      const savedKeys = Array.isArray(excludedValues)
        ? excludedValues.filter(
            (key: unknown): key is string => typeof key === "string",
          )
        : [];
      const savedReasonValues = savedValue.reasons;
      const savedReasons =
        savedReasonValues && typeof savedReasonValues === "object"
          ? Object.fromEntries(
              Object.entries(savedReasonValues).flatMap(([key, value]) =>
                typeof value === "string" ? [[key, value]] : [],
              ),
            )
          : {};
      setExcludedKeys(new Set(savedKeys));
      setReasons(savedReasons);
    } catch {
      setExcludedKeys(new Set());
      setReasons({});
    } finally {
      setIsLoadedFromStorage(true);
      setIsSelectionDirty(false);
    }
  }, [storageKey]);

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
    const next = new Set(excludedKeys);
    visibleEntries.forEach((entry) => {
      const key = getDailyTaskOccurrenceKey(entry);
      if (exclude) next.add(key);
      else next.delete(key);
    });
    setExcludedKeys(next);
    setIsSelectionDirty(true);
  };

  const saveSelections = () => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ excludedKeys: [...excludedKeys], reasons }),
    );
    setIsSelectionDirty(false);
  };

  const resetSelections = () => {
    setExcludedKeys(new Set());
    setReasons({});
    setIsSelectionDirty(true);
  };

  const hasPendingChanges = isLoadedFromStorage && isSelectionDirty;

  if (isUserLoading) {
    return (
      <div className="p-8 text-sm text-neutral-500">{t`Loading KPI...`}</div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 flex-col bg-neutral-50 p-4 dark:bg-neutral-900 sm:p-6"
          : "min-h-full bg-neutral-50 p-4 dark:bg-neutral-900 sm:p-6 lg:p-8"
      }
    >
      <div
        className={
          embedded
            ? "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col"
            : "mx-auto max-w-7xl"
        }
      >
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
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

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard
            label={t`Tổng task`}
            value={summary.total}
            tone="bg-indigo-50 text-indigo-600"
            icon={<HiOutlineClipboardDocumentList className="h-5 w-5" />}
          />
          <SummaryCard
            label={t`Hoàn thành`}
            value={summary.done}
            tone="bg-emerald-50 text-emerald-600"
            icon={<HiCheckCircle className="h-5 w-5" />}
          />
          <SummaryCard
            label={t`Đang chờ`}
            value={summary.pending}
            tone="bg-sky-50 text-sky-600"
            icon={<HiOutlineClock className="h-5 w-5" />}
          />
          <SummaryCard
            label={t`Bỏ lỡ`}
            value={summary.missed}
            tone="bg-rose-50 text-rose-600"
            icon={<HiExclamationTriangle className="h-5 w-5" />}
          />
          <SummaryCard
            label={t`Không tính`}
            value={summary.excluded}
            tone="bg-neutral-100 text-neutral-600"
            icon={<HiOutlineXCircle className="h-5 w-5" />}
          />
          <SummaryCard
            label={t`Tỷ lệ`}
            value={`${summary.completionRate}%`}
            tone="bg-violet-50 text-violet-600"
            icon={<HiOutlineCalendarDays className="h-5 w-5" />}
          />
        </div>

        <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                {t`Từ ngày`}
                <input
                  type="date"
                  min={format(startOfMonth(periodMonth), "yyyy-MM-dd")}
                  max={format(toDate, "yyyy-MM-dd")}
                  value={format(fromDate, "yyyy-MM-dd")}
                  onChange={(event) => updateFromDate(event.target.value)}
                  className="mt-1 block rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
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
                  className="mt-1 block rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                />
              </label>
              <button
                type="button"
                onClick={resetDateRange}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
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
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <span>{t`Bạn có thay đổi chưa lưu cho kỳ KPI này.`}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetSelections}
                className="rounded-lg px-3 py-1.5 font-semibold hover:bg-amber-100"
              >
                {t`Đặt lại`}
              </button>
              <button
                type="button"
                onClick={saveSelections}
                className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
              >
                {t`Lưu lựa chọn KPI`}
              </button>
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
          <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 dark:border-neutral-700 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-neutral-900 dark:text-white">{t`Task trong kỳ`}</h2>
              <p className="text-xs text-neutral-500">
                {visibleEntries.length} {t`task đang hiển thị`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleVisibleEntries(false)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                {t`Tính tất cả đang xem`}
              </button>
              <button
                type="button"
                onClick={() => toggleVisibleEntries(true)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                {t`Bỏ tất cả đang xem`}
              </button>
            </div>
          </div>

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
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900/40">
                  <tr>
                    <th className="w-28 px-4 py-3">{t`Tính KPI`}</th>
                    <th className="px-4 py-3">{t`Task`}</th>
                    <th className="px-4 py-3">{t`Ngày được giao`}</th>
                    <th className="px-4 py-3">{t`Trạng thái`}</th>
                    <th className="px-4 py-3">{t`Lý do loại`}</th>
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
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={() => toggleEntry(entry)}
                              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                              {excluded ? t`Không tính` : t`Tính KPI`}
                            </span>
                          </label>
                        </td>
                        <td
                          className={`px-4 py-3 font-semibold ${excluded ? "text-neutral-400 line-through" : "text-neutral-900 dark:text-white"}`}
                        >
                          {entry.name}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">
                          {format(entry.targetDate, "dd/MM/yyyy HH:mm")}
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
                              onChange={(event) => {
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
