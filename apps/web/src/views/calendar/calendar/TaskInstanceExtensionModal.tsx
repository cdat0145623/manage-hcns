import { t } from "@lingui/macro";
import { useEffect, useState } from "react";

import Button from "~/components/Button";
import Modal from "~/components/modal";
import { DueDateSelector } from "~/views/card/components/DueDateSelector";

interface TaskInstanceExtensionModalProps {
  isVisible: boolean;
  taskInstanceId: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (newEndDate: Date, reason: string) => void;
}

export function TaskInstanceExtensionModal({
  isVisible,
  taskInstanceId,
  isSubmitting,
  onClose,
  onSubmit,
}: TaskInstanceExtensionModalProps) {
  const [newEndDate, setNewEndDate] = useState<Date>();
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();
  const isDeadlineValid =
    newEndDate !== undefined && newEndDate.getTime() > Date.now();
  const canSubmit = isDeadlineValid && trimmedReason.length > 0;

  useEffect(() => {
    if (!isVisible) return;
    setNewEndDate(undefined);
    setReason("");
  }, [isVisible, taskInstanceId]);

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <Modal
      modalSize="sm"
      centered
      isVisible={isVisible}
      closeOnClickOutside={false}
      onClose={handleClose}
    >
      <div className="space-y-5 p-6 text-left">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-dark-1000">
            {t`Gia hạn và mở khóa`}
          </h3>
          <p className="mt-1 text-sm text-neutral-600 dark:text-dark-600">
            {t`Chọn deadline mới để đưa công việc về trạng thái đang chờ.`}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-800 dark:text-dark-800">
            {t`Deadline mới`}
          </label>
          <DueDateSelector
            cardPublicId={taskInstanceId}
            dueDate={newEndDate}
            disabled={isSubmitting}
            label={t`Chọn ngày và giờ`}
            onDateSelect={setNewEndDate}
          />
          {newEndDate && !isDeadlineValid ? (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t`Deadline mới phải ở trong tương lai.`}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label
            htmlFor="task-instance-extension-reason"
            className="text-xs font-semibold text-neutral-800 dark:text-dark-800"
          >
            {t`Lý do gia hạn`}
          </label>
          <textarea
            id="task-instance-extension-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isSubmitting}
            maxLength={500}
            rows={4}
            placeholder={t`Nhập lý do gia hạn`}
            className="w-full resize-none rounded-lg border border-light-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-light-600 focus:ring-1 focus:ring-light-600 disabled:opacity-60 dark:border-dark-300 dark:bg-dark-100 dark:text-dark-1000 dark:focus:border-dark-600 dark:focus:ring-dark-600"
          />
          <p className="text-right text-xs text-neutral-500">
            {reason.length}/500
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={isSubmitting}
            onClick={handleClose}
          >
            {t`Hủy`}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || isSubmitting}
            isLoading={isSubmitting}
            onClick={() => {
              if (newEndDate && canSubmit) {
                onSubmit(newEndDate, trimmedReason);
              }
            }}
          >
            {t`Xác nhận gia hạn`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
