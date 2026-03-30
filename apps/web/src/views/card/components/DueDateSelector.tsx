import { t } from "@lingui/core/macro";
import { format } from "date-fns";
import { HiMiniPlus } from "react-icons/hi2";

import { useModal } from "~/providers/modal";

interface DueDateSelectorProps {
  cardPublicId: string;
  dueDate: Date | null | undefined;
  isLoading?: boolean;
  disabled?: boolean;
}

export function DueDateSelector({
  cardPublicId,
  dueDate,
  isLoading = false,
  disabled = false,
}: DueDateSelectorProps) {
  const { openModal } = useModal();

  return (
    <div className="relative flex w-full items-center text-left">
      <button
        type="button"
        onClick={() => !disabled && openModal("DUE_DATE", cardPublicId)}
        disabled={isLoading || disabled}
        className={`flex h-full w-full items-center rounded-[5px] border-[1px] border-light-50 py-1 pl-2 text-left text-xs text-neutral-900 dark:border-dark-50 dark:text-dark-1000 ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-light-300 hover:bg-light-200 dark:hover:border-dark-200 dark:hover:bg-dark-100"}`}
      >
        {dueDate ? (
          <span>{format(dueDate, "MMM d, yyyy")}</span>
        ) : (
          <>
            <HiMiniPlus size={22} className="pr-2" />
            {t`Set due date`}
          </>
        )}
      </button>
    </div>
  );
}
