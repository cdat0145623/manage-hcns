import { t } from "@lingui/core/macro";
import { HiXMark } from "react-icons/hi2";

import type { Permission } from "@kan/shared";
import { permissionCategories } from "@kan/shared";

import Button from "~/components/Button";
import Toggle from "~/components/Toggle";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

export function EditMemberPermissionsModal() {
  const { workspace } = useWorkspace();
  const { modalContentType, entityId, entityLabel, closeModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const { data, isLoading } = api.permission.getMemberPermissions.useQuery(
    {
      workspacePublicId: workspace.publicId,
      memberPublicId: entityId,
    },
    {
      enabled:
        modalContentType === "EDIT_MEMBER_PERMISSIONS" && !!entityId,
    },
  );

  const grantMutation = api.permission.grantPermission.useMutation({
    onSuccess: () => {
      showPopup({
        header: t`Permissions updated`,
        message: t`The member's permissions have been updated.`,
        icon: "success",
      });
    },
    onError: () => {
      showPopup({
        header: t`Unable to update permissions`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await utils.permission.getMemberPermissions.invalidate({
        workspacePublicId: workspace.publicId,
        memberPublicId: entityId,
      });
    },
  });

  const revokeMutation = api.permission.revokePermission.useMutation({
    onSuccess: () => {
      showPopup({
        header: t`Permissions updated`,
        message: t`The member's permissions have been updated.`,
        icon: "success",
      });
    },
    onError: () => {
      showPopup({
        header: t`Unable to update permissions`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await utils.permission.getMemberPermissions.invalidate({
        workspacePublicId: workspace.publicId,
        memberPublicId: entityId,
      });
    },
  });

  const resetMutation = api.permission.resetMemberPermissions.useMutation({
    onSuccess: async () => {
      showPopup({
        header: t`Permissions reset`,
        message: t`This member's permissions have been reset to their role defaults.`,
        icon: "success",
      });

      await utils.permission.getMemberPermissions.invalidate({
        workspacePublicId: workspace.publicId,
        memberPublicId: entityId,
      });
    },
    onError: () => {
      showPopup({
        header: t`Unable to reset permissions`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
  });

  const effectivePermissions = (data?.permissions ?? []) as Permission[];
  const hasOverrides = (data?.overrides?.length ?? 0) > 0;
  const isBusy =
    grantMutation.isPending ||
    revokeMutation.isPending ||
    resetMutation.isPending;

  const handleToggle = (permission: Permission, nextState: boolean) => {
    if (!workspace.publicId || !entityId) return;

    if (nextState) {
      grantMutation.mutate({
        workspacePublicId: workspace.publicId,
        memberPublicId: entityId,
        permission,
      });
    } else {
      revokeMutation.mutate({
        workspacePublicId: workspace.publicId,
        memberPublicId: entityId,
        permission,
      });
    }
  };

  const permissionLabels: Record<Permission, string> = {
    "workspace:view": t`Xem không gian làm việc`,
    "workspace:edit": t`Chỉnh sửa không gian làm việc`,
    "workspace:delete": t`Xóa không gian làm việc`,
    "workspace:manage": t`Quản lý cài đặt không gian làm việc`,

    "board:view": t`Xem bảng`,
    "board:create": t`Tạo bảng`,
    "board:edit": t`Chỉnh sửa bảng`,
    "board:delete": t`Xóa bảng`,

    "list:view": t`Xem danh sách`,
    "list:create": t`Tạo danh sách`,
    "list:edit": t`Chỉnh sửa danh sách`,
    "list:delete": t`Xóa danh sách`,

    "card:view": t`Xem thẻ`,
    "card:create": t`Tạo thẻ`,
    "card:edit": t`Chỉnh sửa thẻ`,
    "card:delete": t`Xóa thẻ`,
    "card:attach": t`Đính kèm thẻ`,
    "card:tick": t`Check thẻ`,

    "comment:view": t`Xem bình luận`,
    "comment:create": t`Thêm bình luận`,
    "comment:edit": t`Chỉnh sửa bình luận`,
    "comment:delete": t`Xóa bình luận`,

    "member:view": t`Xem thành viên`,
    "member:invite": t`Mời thành viên`,
    "member:edit": t`Chỉnh sửa vai trò và quyền của thành viên`,
    "member:remove": t`Xóa thành viên`,
  };

  return (
    <div className="w-full rounded-md bg-light-50 text-light-1000 dark:bg-dark-100 dark:text-dark-1000">
      <div className="px-5 pt-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="mb-1 text-sm font-semibold">
              {t`Sửa quyền`}
            </h2>
            <p className="min-h-[16px] text-xs text-light-900 dark:text-dark-900">
              {entityLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-light-900 hover:bg-light-200 focus:outline-none dark:text-dark-900 dark:hover:bg-dark-200"
            aria-label={t`Đóng`}
          >
            <HiXMark className="h-3.5 w-3.5" />
          </button>
        </div>

        {isLoading ? (
          <p className="text-xs text-light-900 dark:text-dark-900">
            {t`Đang tải ...`}
          </p>
        ) : (
          <div className="max-h-80 pb-4 space-y-3 overflow-y-auto pr-1">
            {Object.values(permissionCategories).map((category, index) => (
              <div
                key={category.label}
                className={`py-2 ${
                  index > 0
                    ? "border-t border-light-300 dark:border-dark-300"
                    : ""
                }`}
              >
                <div className="my-2 text-[12px] font-semibold text-light-900 dark:text-dark-950">
                  {category.label}
                </div>
                <div className="space-y-1.5">
                  {category.permissions.map((permission) => {
                    const label =
                      permissionLabels[permission] ?? (permission as string);

                    return (
                      <div
                        key={permission}
                        className="flex items-center justify-between gap-3 py-0.5"
                      >
                        <span className="text-xs text-light-900 dark:text-dark-900">
                          {label}
                        </span>
                        <Toggle
                          label={label}
                          showLabel={false}
                          isChecked={effectivePermissions.includes(permission)}
                          disabled={isBusy}
                          onChange={() =>
                            handleToggle(
                              permission,
                              !effectivePermissions.includes(permission),
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!workspace.publicId || !entityId || isBusy) return;
              resetMutation.mutate({
                workspacePublicId: workspace.publicId,
                memberPublicId: entityId,
              });
            }}
            disabled={isBusy || !hasOverrides}
            isLoading={resetMutation.isPending}
          >
            {t`Đặt lại quyền`}
          </Button>
        </div>
      </div>
    </div>
  );
}


