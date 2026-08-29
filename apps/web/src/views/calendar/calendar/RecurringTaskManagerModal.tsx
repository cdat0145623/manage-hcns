import { t } from "@lingui/macro";
import { useDeferredValue, useMemo, useState } from "react";
import { HiChartBar, HiOutlineArrowPath } from "react-icons/hi2";

import Button from "~/components/Button";
import Input from "~/components/Input";
import Modal from "~/components/modal";
import { api } from "~/utils/api";

type Priority = "high" | "medium" | "low";
type PriorityFilter = Priority | "none";
export interface RecurringTaskMaster {
  publicId: string;
  name: string | null;
  description: string | null;
  createdAt: Date;
  startDate: Date;
  endDate: Date;
  priority: Priority | null;
  overrideAmountVnd: number | null;
  rruleString: string | null;
  recurrenceText: string;
  assignee: { id: string; name: string | null; email: string | null };
  creator: { id: string; name: string | null; email: string | null };
}

const PRIORITIES: Array<{
  value: PriorityFilter;
  label: string;
  className: string;
}> = [
  {
    value: "high",
    label: t`Cao`,
    className: "border-red-200 bg-red-50 text-red-700",
  },
  {
    value: "medium",
    label: t`Trung bình`,
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    value: "low",
    label: t`Thấp`,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    value: "none",
    label: t`Không áp dụng phạt`,
    className: "border-neutral-200 bg-neutral-50 text-neutral-700",
  },
];

const formatVnd = (amount: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);

const formatCreatedAt = (date: Date) =>
  new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));

interface RecurringTaskManagerModalProps {
  isVisible: boolean;
  selectedUserId?: string;
  onClose: () => void;
  onOpenKpi: () => void;
  onEditMaster: (master: RecurringTaskMaster) => void;
}

export function RecurringTaskManagerModal({
  isVisible,
  selectedUserId,
  onClose,
  onOpenKpi,
  onEditMaster,
}: RecurringTaskManagerModalProps) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter | null>(
    null,
  );
  const deferredSearch = useDeferredValue(search);
  const masters = api.taskMaster.listAdmin.useQuery(
    { search: deferredSearch || undefined, selectedUserId },
    { enabled: isVisible },
  );

  const filteredMasters = useMemo(
    () =>
      (masters.data ?? []).filter((master) =>
        priorityFilter === "none"
          ? master.priority === null
          : priorityFilter === null || master.priority === priorityFilter,
      ),
    [masters.data, priorityFilter],
  );

  return (
    <Modal modalSize="xl" centered isVisible={isVisible} onClose={onClose}>
      <section className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-light-1000 dark:text-dark-1000">
              {t`Công việc lặp lại`}
            </h2>
            <p className="mt-1 text-sm text-light-900 dark:text-dark-900">
              {t`Quản lý tất cả công việc lặp lại mà không cần mở từng instance trên lịch.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onOpenKpi}>
              <HiChartBar className="mr-1.5 h-4 w-4" />
              {t`Tính KPI`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t`Làm mới danh sách công việc lặp lại`}
              onClick={() => void masters.refetch()}
            >
              <HiOutlineArrowPath className="h-5 w-5 text-blue-600" />
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t`Tìm theo tên công việc`}
          />
        </div>

        <div
          className="mt-4 flex flex-wrap gap-2"
          aria-label={t`Lọc theo mức phạt`}
        >
          {PRIORITIES.map((priority) => {
            const count = (masters.data ?? []).filter((master) =>
              priority.value === "none"
                ? master.priority === null
                : master.priority === priority.value,
            ).length;
            const isActive = priorityFilter === priority.value;
            return (
              <button
                key={priority.value}
                type="button"
                aria-pressed={isActive}
                onClick={() =>
                  setPriorityFilter(isActive ? null : priority.value)
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${priority.className} ${isActive ? "ring-2 ring-blue-500 ring-offset-1" : "opacity-75 hover:opacity-100"}`}
              >
                {priority.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="mt-4 max-h-[60vh] overflow-x-auto overflow-y-auto rounded-xl border border-light-300 dark:border-dark-400">
          {masters.isLoading ? (
            <div
              className="space-y-3 p-4"
              aria-label={t`Đang tải công việc lặp lại`}
            >
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-14 animate-pulse rounded-lg bg-light-200 dark:bg-dark-200"
                />
              ))}
            </div>
          ) : masters.isError ? (
            <div className="p-5 text-sm text-red-700 dark:text-red-300">
              <p>{t`Không thể tải danh sách công việc lặp lại.`}</p>
              <Button
                className="mt-3"
                size="sm"
                variant="secondary"
                onClick={() => void masters.refetch()}
              >
                {t`Thử lại`}
              </Button>
            </div>
          ) : filteredMasters.length === 0 ? (
            <p className="p-6 text-center text-sm text-light-900 dark:text-dark-900">
              {t`Không tìm thấy công việc lặp lại.`}
            </p>
          ) : (
            <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
              <thead className="sticky top-0 z-10 bg-light-100 text-xs text-light-900 dark:bg-dark-200 dark:text-dark-900">
                <tr>
                  <th className="w-[22%] px-4 py-3 font-semibold">{t`Tên công việc`}</th>
                  <th className="w-[14%] px-4 py-3 font-semibold">{t`Người tạo`}</th>
                  <th className="w-[14%] px-4 py-3 font-semibold">{t`Giao cho`}</th>
                  <th className="w-[11%] px-4 py-3 font-semibold">{t`Ngày tạo`}</th>
                  <th className="w-[19%] px-4 py-3 font-semibold">{t`Lặp lại`}</th>
                  <th className="w-[13%] px-4 py-3 font-semibold">{t`Nhãn phạt`}</th>
                  <th className="w-[7%] px-4 py-3 text-right font-semibold">{t`Thao tác`}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-300 dark:divide-dark-400">
                {filteredMasters.map((master) => (
                  <tr
                    key={master.publicId}
                    className="align-top hover:bg-light-100/60 dark:hover:bg-dark-200/60"
                  >
                    <td className="px-4 py-4 font-medium text-light-1000 dark:text-dark-1000">
                      {master.name ?? t`Không có tên`}
                    </td>
                    <td className="px-4 py-4 text-light-900 dark:text-dark-900">
                      {master.creator.name ??
                        master.creator.email ??
                        t`Không xác định`}
                    </td>
                    <td className="px-4 py-4 text-light-900 dark:text-dark-900">
                      {master.assignee.name ??
                        master.assignee.email ??
                        t`Chưa phân công`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-light-900 dark:text-dark-900">
                      {formatCreatedAt(master.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-light-900 dark:text-dark-900">
                      {master.recurrenceText}
                    </td>
                    <td className="px-4 py-4 text-light-900 dark:text-dark-900">
                      <div className="font-medium">
                        {master.priority === "high"
                          ? t`Cao`
                          : master.priority === "medium"
                            ? t`Trung bình`
                            : master.priority === "low"
                              ? t`Thấp`
                              : t`Không áp dụng phạt`}
                      </div>
                      <div className="mt-1 text-xs">
                        {master.overrideAmountVnd == null
                          ? t`Dùng mức chung`
                          : t`Mức riêng ${formatVnd(master.overrideAmountVnd)}`}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onEditMaster(master)}
                      >{t`Chỉnh sửa`}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </Modal>
  );
}
