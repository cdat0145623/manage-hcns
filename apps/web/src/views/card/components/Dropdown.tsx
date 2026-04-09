import { t } from "@lingui/core/macro";
import {
  HiEllipsisHorizontal,
  HiLink,
  HiOutlineCheckCircle,
  HiOutlinePaperClip,
  HiOutlineTrash,
} from "react-icons/hi2";

import { authClient } from "@kan/auth/client";

import Dropdown from "~/components/Dropdown";
import { usePermissions } from "~/hooks/usePermissions";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";

export default function CardDropdown({
  cardPublicId,
  isTemplate,
  boardPublicId,
  cardCreatedBy,
  hideChecklist = false,
}: {
  cardPublicId: string;
  isTemplate?: boolean;
  boardPublicId?: string;
  cardCreatedBy?: string | null;
  hideChecklist?: boolean;
}) {
  const { openModal } = useModal();
  const { showPopup } = usePopup();
  const { canEditCard, canDeleteCard } = usePermissions();
  const { data: session } = authClient.useSession();
  const isCreator = cardCreatedBy && session?.user.id === cardCreatedBy;

  const handleCopyCardLink = async () => {
    const path =
      isTemplate && boardPublicId
        ? `/templates/${boardPublicId}/cards/${cardPublicId}`
        : `/cards/${cardPublicId}`;
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      showPopup({
        header: t`Link copied`,
        icon: "success",
        message: t`Card URL copied to clipboard`,
      });
    } catch (error) {
      console.error(error);
      showPopup({
        header: t`Unable to copy link`,
        icon: "error",
        message: t`Please try again.`,
      });
    }
  };

  const items = [
    {
      label: t`Copy link thẻ`,
      action: handleCopyCardLink,
      icon: <HiLink className="h-[16px] w-[16px] text-light-600 dark:text-dark-600" />,
    },
    ...(canEditCard
      ? [
          {
            label: t`Đính kèm`,
            action: () => openModal("ADD_ATTACHMENT"),
            icon: (
              <HiOutlinePaperClip className="h-[16px] w-[16px] text-light-600 dark:text-dark-600" />
            ),
          },
          ...(!hideChecklist
            ? [
                {
                  label: t`Thêm Checklist`,
                  action: () => openModal("ADD_CHECKLIST"),
                  icon: (
                    <HiOutlineCheckCircle className="h-[16px] w-[16px] text-light-600 dark:text-dark-600" />
                  ),
                },
              ]
            : []),
        ]
      : []),
    ...(canDeleteCard || isCreator
      ? [
          {
            label: t`Xóa thẻ`,
            action: () => openModal("DELETE_CARD"),
            icon: (
              <HiOutlineTrash className="h-[16px] w-[16px] text-light-600 dark:text-dark-600" />
            ),
          },
        ]
      : []),
  ];

  if (items.length === 0) {
    return null;
  }

  return (
    <Dropdown items={items}>
      <HiEllipsisHorizontal className="h-5 w-5 text-light-600 transition-colors hover:text-light-900 dark:text-dark-600 dark:hover:text-dark-1000" />
    </Dropdown>
  );
}
