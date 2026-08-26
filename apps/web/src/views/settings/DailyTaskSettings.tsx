import { DialogTitle } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { HiOutlineCalendarDays, HiOutlinePencilSquare } from "react-icons/hi2";

import Button from "~/components/Button";
import Input from "~/components/Input";
import Modal from "~/components/modal";
import { PageHead } from "~/components/PageHead";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

type Priority = "high" | "medium" | "low";

const PRIORITY_STYLE: Record<Priority, { badge: string; bar: string }> = {
  high: {
    badge: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    bar: "bg-red-500",
  },
  medium: {
    badge:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  low: {
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
};

const priorityLabel = (priority: Priority) => {
  if (priority === "high") return t`Cao`;
  if (priority === "medium") return t`Trung bình`;
  return t`Thấp`;
};

const formatVnd = (amount: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);

const dateInputValue = (date: Date) => format(date, "yyyy-MM-dd");

const todayInputValue = () => dateInputValue(new Date());

const parseAppDay = (value: string, endOfDay = false) =>
  new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+07:00`);

interface PolicyEditorProps {
  priority: Priority;
  currentAmount: number;
}

function PolicyEditor({ priority, currentAmount }: PolicyEditorProps) {
  const { closeModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const [amount, setAmount] = useState(String(currentAmount));
  const [effectiveFrom, setEffectiveFrom] = useState(todayInputValue);
  const [effectiveTo, setEffectiveTo] = useState(todayInputValue);
  const [isConfirming, setIsConfirming] = useState(false);
  const parsedAmount = Number(amount);
  const amountIsValid =
    amount.trim() !== "" &&
    Number.isSafeInteger(parsedAmount) &&
    parsedAmount >= 0;
  const dateIsValid = effectiveTo !== "" && effectiveTo >= effectiveFrom;

  const mutation = api.taskPenalty.saveGlobalPolicy.useMutation({
    onSuccess: async () => {
      await utils.taskPenalty.settings.refetch();
      showPopup({
        header: t`Đã lưu chính sách`,
        message: t`Mức phạt mới đã được lưu.`,
        icon: "success",
      });
      closeModal();
    },
    onError: (error) => {
      showPopup({
        header: t`Không thể lưu`,
        message: error.message,
        icon: "error",
      });
    },
  });

  const submit = () => {
    if (!amountIsValid || !dateIsValid) return;
    mutation.mutate({
      priority,
      amountVnd: parsedAmount,
      effectiveFrom: parseAppDay(effectiveFrom),
      effectiveTo: parseAppDay(effectiveTo, true),
    });
  };

  return (
    <div className="p-5 sm:p-6">
      <DialogTitle className="text-base font-semibold text-light-1000 dark:text-dark-1000">
        {t`Cập nhật mức phạt`} {priorityLabel(priority)}
      </DialogTitle>
      {!isConfirming ? (
        <div className="mt-5 space-y-4">
          <label className="block space-y-2 text-sm font-medium text-light-1000 dark:text-dark-1000">
            <span>{t`Số tiền phạt`}</span>
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              errorMessage={
                amountIsValid
                  ? undefined
                  : t`Nhập số nguyên VND lớn hơn hoặc bằng 0.`
              }
            />
            {amountIsValid && (
              <span className="block text-xs font-normal text-light-900 dark:text-dark-900">
                {formatVnd(parsedAmount)}
              </span>
            )}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-light-1000 dark:text-dark-1000">
              <span>{t`Bắt đầu áp dụng`}</span>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-light-1000 dark:text-dark-1000">
              <span>{t`Kết thúc`}</span>
              <Input
                type="date"
                min={effectiveFrom}
                value={effectiveTo}
                onChange={(event) => setEffectiveTo(event.target.value)}
              />
            </label>
          </div>
          {!dateIsValid && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t`Ngày kết thúc không được sớm hơn ngày bắt đầu.`}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeModal}>
              {t`Hủy`}
            </Button>
            <Button
              disabled={!amountIsValid || !dateIsValid}
              onClick={() => setIsConfirming(true)}
            >
              {t`Tiếp tục`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="rounded-lg border border-light-400 bg-light-100 p-4 text-sm text-light-1000 dark:border-dark-500 dark:bg-dark-200 dark:text-dark-1000">
            <p className="font-semibold">{t`Xác nhận phạm vi hiệu lực`}</p>
            <p className="mt-2 leading-6">
              {t`Mức phạt`} {priorityLabel(priority)} {t`sẽ là`}{" "}
              <strong>{formatVnd(parsedAmount)}</strong> {t`từ ngày`}{" "}
              <strong>{effectiveFrom}</strong> {t`đến hết ngày`}{" "}
              <strong>{effectiveTo}</strong>.
            </p>
            <p className="mt-2 text-xs text-light-900 dark:text-dark-900">
              {t`Các khoản phạt đã ghi nhận trong giai đoạn này sẽ được tính lại theo chính sách mới.`}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsConfirming(false)}>
              {t`Quay lại`}
            </Button>
            <Button isLoading={mutation.isPending} onClick={submit}>
              {t`Xác nhận lưu`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DailyTaskSettings() {
  const { data: currentUser, isLoading: isLoadingUser } =
    api.user.getUser.useQuery();
  const isAdmin = currentUser?.role === "ADMIN";
  const settings = api.taskPenalty.settings.useQuery(undefined, {
    enabled: isAdmin,
  });
  const { openModal, isOpen, modalContentType, entityId } = useModal();
  const selected = useMemo(
    () => settings.data?.priorities.find((item) => item.priority === entityId),
    [entityId, settings.data?.priorities],
  );

  return (
    <>
      <PageHead title={t`Cài đặt | Daily Task`} />
      <section className="border-t border-light-300 py-8 dark:border-dark-300">
        <div className="max-w-2xl">
          <h2 className="text-base font-semibold text-light-1000 dark:text-dark-1000">
            {t`Mức phạt Daily Task`}
          </h2>
          <p className="mt-2 text-sm leading-6 text-light-900 dark:text-dark-900">
            {t`Cấu hình số tiền phạt theo ba mức độ ưu tiên và giai đoạn áp dụng cụ thể.`}
          </p>
        </div>

        {isLoadingUser || settings.isLoading ? (
          <div className="mt-7 space-y-3" aria-label={t`Đang tải cấu hình`}>
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-lg bg-light-200 dark:bg-dark-200"
              />
            ))}
          </div>
        ) : !isAdmin ? (
          <div className="mt-7 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {t`Chỉ quản trị viên hệ thống được xem và thay đổi cấu hình này.`}
          </div>
        ) : settings.isError ? (
          <div className="mt-7 rounded-lg border border-red-300 p-4 text-sm text-red-700 dark:border-red-900 dark:text-red-300">
            <p>{t`Không thể tải cấu hình mức phạt.`}</p>
            <Button
              className="mt-3"
              variant="secondary"
              size="sm"
              onClick={() => void settings.refetch()}
            >
              {t`Thử lại`}
            </Button>
          </div>
        ) : (
          <div className="mt-7 overflow-hidden rounded-lg border border-light-400 dark:border-dark-400">
            {settings.data?.priorities.map((item) => {
              const current = item.current;
              return (
                <div
                  key={item.priority}
                  className="relative grid gap-4 border-b border-light-300 p-4 last:border-b-0 dark:border-dark-300 sm:grid-cols-[1.1fr_1fr_1.4fr_auto] sm:items-center"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_STYLE[item.priority].bar}`}
                  />
                  <div>
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${PRIORITY_STYLE[item.priority].badge}`}
                    >
                      {priorityLabel(item.priority)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-light-900 dark:text-dark-900">
                      {t`Hiện tại`}
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-light-1000 dark:text-dark-1000">
                      {current
                        ? formatVnd(current.amountVnd)
                        : t`Chưa cấu hình`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-light-900 dark:text-dark-900">
                      {t`Hiệu lực`}
                    </p>
                    <p className="mt-1 text-sm text-light-1000 dark:text-dark-1000">
                      {current
                        ? `${dateInputValue(current.effectiveFrom)} - ${current.effectiveTo ? dateInputValue(current.effectiveTo) : t`đến khi thay đổi`}`
                        : t`Không có phiên bản hiệu lực`}
                    </p>
                    {item.history.length > 0 && (
                      <p className="mt-1 text-xs text-light-800 dark:text-dark-800">
                        {item.history.length} {t`phiên bản trong lịch sử`}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    iconLeft={<HiOutlinePencilSquare className="h-4 w-4" />}
                    onClick={() =>
                      openModal("EDIT_DAILY_TASK_PENALTY", item.priority)
                    }
                  >
                    {t`Cập nhật`}
                  </Button>
                  {item.history.length > 0 && (
                    <details className="sm:col-span-4">
                      <summary className="cursor-pointer text-xs font-medium text-light-900 hover:text-light-1000 dark:text-dark-900 dark:hover:text-dark-1000">
                        {t`Xem lịch sử`}
                      </summary>
                      <div className="mt-3 overflow-x-auto border-t border-light-300 pt-3">
                        <div>
                          <p className="text-xs font-semibold text-light-1000 dark:text-dark-1000">
                            {t`Lịch sử`}
                          </p>
                          <table className="w-full min-w-[560px] text-left text-xs">
                            <thead className="text-light-900 dark:text-dark-900">
                              <tr>
                                <th className="px-2 py-2 font-semibold">{t`Khoảng áp dụng`}</th>
                                <th className="px-2 py-2 font-semibold">{t`Mức phạt`}</th>
                                <th className="px-2 py-2 font-semibold">{t`Cập nhật lúc`}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-light-300 dark:divide-dark-400">
                              {item.history.map((policy) => (
                                <tr key={policy.publicId}>
                                  <td className="px-2 py-2 text-light-1000 dark:text-dark-1000">
                                    {dateInputValue(policy.effectiveFrom)} –{" "}
                                    {policy.effectiveTo
                                      ? dateInputValue(policy.effectiveTo)
                                      : t`Không có ngày kết thúc`}
                                  </td>
                                  <td className="px-2 py-2 font-medium text-light-1000 dark:text-dark-1000">
                                    {formatVnd(policy.amountVnd)}
                                  </td>
                                  <td className="px-2 py-2 text-light-900 dark:text-dark-900">
                                    {policy.createdAt
                                      ? format(
                                          policy.createdAt,
                                          "HH:mm, dd/MM/yyyy",
                                        )
                                      : t`Không xác định`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex items-start gap-3 text-xs leading-5 text-light-900 dark:text-dark-900">
          <HiOutlineCalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t`Khoảng ngày kết thúc bao gồm cả ngày đó. Ngoài khoảng đã cấu hình, mức phạt không được áp dụng.`}</p>
        </div>
      </section>

      <Modal
        modalSize="md"
        centered
        isVisible={
          isOpen && modalContentType === "EDIT_DAILY_TASK_PENALTY" && !!selected
        }
        closeOnClickOutside={false}
      >
        {selected && (
          <PolicyEditor
            key={selected.priority}
            priority={selected.priority}
            currentAmount={selected.current?.amountVnd ?? 0}
          />
        )}
      </Modal>
    </>
  );
}
