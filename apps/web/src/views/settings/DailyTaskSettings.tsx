import { DialogTitle } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { useMemo, useState } from "react";
import { HiOutlinePencilSquare } from "react-icons/hi2";

import Button from "~/components/Button";
import Input from "~/components/Input";
import Modal from "~/components/modal";
import { PageHead } from "~/components/PageHead";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { PenaltyPriorityBadge } from "~/views/daily-task-penalty/PenaltyPriorityBadge";
import { formatPenaltyVnd } from "~/views/daily-task-penalty/penalty-formatters";

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

interface PolicyEditorProps {
  priority: Priority;
  currentAmount: number;
}

function PolicyEditor({ priority, currentAmount }: PolicyEditorProps) {
  const { closeModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const [amount, setAmount] = useState(String(currentAmount));
  const [isConfirming, setIsConfirming] = useState(false);
  const parsedAmount = Number(amount);
  const amountIsValid =
    amount.trim() !== "" &&
    Number.isSafeInteger(parsedAmount) &&
    parsedAmount >= 0;

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
    if (!amountIsValid) return;
    mutation.mutate({
      priority,
      amountVnd: parsedAmount,
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
                {formatPenaltyVnd(parsedAmount)}
              </span>
            )}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeModal}>
              {t`Hủy`}
            </Button>
            <Button
              disabled={!amountIsValid}
              onClick={() => setIsConfirming(true)}
            >
              {t`Tiếp tục`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="rounded-lg border border-light-400 bg-light-100 p-4 text-sm text-light-1000 dark:border-dark-500 dark:bg-dark-200 dark:text-dark-1000">
            <p className="font-semibold">{t`Xác nhận cập nhật mức phạt`}</p>
            <p className="mt-2 leading-6">
              {t`Mức phạt`} {priorityLabel(priority)} {t`sẽ là`}{" "}
              <strong>{formatPenaltyVnd(parsedAmount)}</strong>.
            </p>
            <p className="mt-2 text-xs text-light-900 dark:text-dark-900">
              {t`Thay đổi này áp dụng lại cho toàn bộ Daily Task đang dùng mức mặc định, gồm cả các task trong quá khứ.`}
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
            {t`Cấu hình số tiền phạt hiện hành theo ba mức độ ưu tiên.`}
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
              return (
                <div
                  key={item.priority}
                  className="relative grid gap-4 border-b border-light-300 p-4 last:border-b-0 dark:border-dark-300 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_STYLE[item.priority].bar}`}
                  />
                  <div>
                    <PenaltyPriorityBadge priority={item.priority} />
                  </div>
                  <div>
                    <p className="text-xs text-light-900 dark:text-dark-900">
                      {t`Hiện tại`}
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-light-1000 dark:text-dark-1000">
                      {item.amountVnd === null
                        ? t`Chưa cấu hình`
                        : formatPenaltyVnd(item.amountVnd)}
                    </p>
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
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-5 text-xs leading-5 text-light-900 dark:text-dark-900">
          {t`Mức mặc định được áp dụng cho tất cả Daily Task không có mức phạt riêng.`}
        </p>
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
            currentAmount={selected.amountVnd ?? 0}
          />
        )}
      </Modal>
    </>
  );
}
