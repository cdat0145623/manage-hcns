import { t } from "@lingui/core/macro";
import {
  HiEllipsisHorizontal,
  HiLink,
  HiOutlineDocumentDuplicate,
  HiOutlineTrash,
  HiOutlineStar,
  HiStar,
} from "react-icons/hi2";
import { IoArchiveOutline } from "react-icons/io5";
import Dropdown from "~/components/Dropdown";
import { usePermissions } from "~/hooks/usePermissions";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

export default function BoardDropdown({
  isTemplate,
  isLoading,
  isArchived,
  boardPublicId,
  isFavorite,
  isTemplateDefault,
  boardName,
  onShowActivity,
}: {
  isTemplate: boolean;
  isLoading: boolean;
  boardPublicId: string;
  isArchived?: boolean;
  isFavorite?: boolean;
  isTemplateDefault?: boolean;
  boardName?: string;
  onShowActivity?: () => void;
}) {
  const { openModal } = useModal();
  const { showPopup } = usePopup();
  const { canEditBoard, canDeleteBoard, canCreateBoard, canArchiveBoard } =
    usePermissions();
  const utils = api.useUtils();

  const updateBoard = api.board.update.useMutation({
    onSuccess: (_data, variables) => {
      void utils.board.all.invalidate();
      void utils.board.byId.invalidate();
      if (variables.isArchived !== undefined) {
        showPopup({
          header: variables.isArchived ? t`Đã lưu trữ` : t`Đã bỏ lưu trữ`,
          message: variables.isArchived
            ? t`Bảng đã được lưu trữ.`
            : t`Bảng đã được bỏ lưu trữ.`,
          icon: "success",
        });
      } else if (variables.favorite !== undefined) {
        showPopup({
          header: variables.favorite
            ? t`Đã thêm vào yêu thích`
            : t`Đã bỏ yêu thích`,
          message: variables.favorite
            ? t`${boardName ?? "Board"} đã được thêm vào mục yêu thích của bạn.`
            : t`${boardName ?? "Board"} đã được bỏ khỏi mục yêu thích của bạn.`,
          icon: "success",
        });
      }
    },
    onError: () => {
      showPopup({
        header: t`Không thể cập nhật bảng`,
        message: t`Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ khách hàng.`,
        icon: "error",
      });
    },
  });

  const updateTemplateDefault = api.board.setTemplateDefault.useMutation({
    onSuccess: () => {
      void utils.board.all.invalidate();
      void utils.board.byId.invalidate();
      showPopup({
        header: t`Đã cập nhật mẫu mặc định`,
        message: t`Bảng đã được cập nhật làm mẫu mặc định.`,
        icon: "success",
      });
    },
    onError: () => {
      showPopup({
        header: t`Không thể cập nhật mẫu mặc định`,
        message: t`Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ khách hàng.`,
        icon: "error",
      });
    },
  });

  const handleToggleFavorite = () => {
    updateBoard.mutate({
      boardPublicId,
      favorite: !isFavorite,
    });
  };

  const handleToggleTemplateDefault = () => {
    updateTemplateDefault.mutate({
      boardPublicId,
      isTemplateDefault: !isTemplateDefault,
    });
  };

  const handleArchiveOrUnarchive = () => {
    updateBoard.mutate({
      boardPublicId,
      isArchived: !isArchived,
    });
  };

  const isArchiveActionPending = updateBoard.isPending;

  const items = [
    ...(isTemplate && canCreateBoard
      ? [
        {
          label: t`Tạo mẫu`,
          action: () => openModal("CREATE_TEMPLATE"),
          icon: (
            <HiOutlineDocumentDuplicate className="h-[16px] w-[16px] text-dark-900" />
          ),
        },
      ]
      : []),
    ...(!isTemplate && canEditBoard
      ? [
        {
          label: t`Chỉnh sửa URL`,
          action: () => openModal("UPDATE_BOARD_SLUG"),
          icon: <HiLink className="h-[16px] w-[16px] text-dark-900" />,
        },
      ]
      : []),
    ...(!isTemplate && canArchiveBoard
      ? [
        {
          label: isArchived ? t`Bỏ lưu trữ` : t`Lưu trữ`,
          action: handleArchiveOrUnarchive,
          icon: (
            <IoArchiveOutline className="h-[16px] w-[16px] text-dark-900" />
          ),
        },
      ]
      : []),
    {
      label: isFavorite
        ? t`Bỏ yêu thích`
        : t`Thêm vào yêu thích`,
      action: handleToggleFavorite,
      icon: isFavorite ? (
        <HiStar className="h-[16px] w-[16px] text-dark-900" />
      ) : (
        <HiOutlineStar className="h-[16px] w-[16px] text-dark-900" />
      ),
    },
    {
      label: isTemplateDefault
        ? t`Bỏ mẫu mặc định`
        : t`Đặt làm mẫu mặc định`,
      action: handleToggleTemplateDefault,
      icon: isTemplateDefault ? (
        <HiStar className="h-[16px] w-[16px] text-dark-900" />
      ) : (
        <HiOutlineStar className="h-[16px] w-[16px] text-dark-900" />
      ),
    },
    ...(onShowActivity
      ? [
        {
          label: t`Menu`,
          action: onShowActivity,
          icon: <HiEllipsisHorizontal className="h-[16px] w-[16px] text-dark-900" />,
        },
      ]
      : []),
    ...(canDeleteBoard
      ? [
        {
          label: isTemplate ? t`Xóa mẫu` : t`Xóa bảng`,
          action: () => openModal("DELETE_BOARD"),
          icon: (
            <HiOutlineTrash className="h-[16px] w-[16px] text-dark-900" />
          ),
        },
      ]
      : []),
  ];

  if (items.length === 0) {
    return null;
  }

  return (
    <Dropdown
      disabled={isLoading || isArchiveActionPending}
      items={items}
    >
      <HiEllipsisHorizontal className="h-5 w-5 text-dark-900" />
    </Dropdown>
  );
}
