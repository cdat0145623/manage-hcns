import { t } from "@lingui/core/macro";

import { permissionCategories, roles } from "@kan/shared";
import type { Permission, Role } from "@kan/shared";

import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

function formatRoleLabel(role: Role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

const permissionLabels: Record<Permission, string> = {
  "workspace:view": t`Xem không gian làm việc`,
  "workspace:edit": t`Chỉnh sửa không gian làm việc`,
  "workspace:delete": t`Xóa không gian làm việc`,
  "workspace:manage": t`Quản lý không gian làm việc`,

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
  "card:tick": t`Tích thẻ`,

  "comment:view": t`Xem bình luận`,
  "comment:create": t`Thêm bình luận`,
  "comment:edit": t`Chỉnh sửa bình luận`,
  "comment:delete": t`Xóa bình luận`,

  "member:view": t`Xem thành viên`,
  "member:invite": t`Mời thành viên`,
  "member:edit": t`Chỉnh sửa thành viên`,
  "member:remove": t`Xóa thành viên`,
};

export function RolePermissions() {
  const { workspace } = useWorkspace();

  const utils = api.useUtils();

  const { data, isLoading } =
    api.permission.getWorkspaceRolePermissions.useQuery(
      { workspacePublicId: workspace.publicId },
      { enabled: !!workspace.publicId },
    );

  const systemRoles = (data?.roles ?? []).filter((role) =>
    (roles).includes(role.name as Role),
  );

  const orderedRoleNames: Role[] = ["ADMIN", "NVKT_MANAGER", "NVKD_MANAGER", "NVVP"].filter(
    (role) => systemRoles.some((r) => r.name === role),
  ) as Role[];

  const grantMutation = api.permission.grantRolePermission.useMutation({
    onSettled: async () => {
      if (!workspace.publicId) return;
      await utils.permission.getWorkspaceRolePermissions.invalidate({
        workspacePublicId: workspace.publicId,
      });
    },
  });

  const revokeMutation = api.permission.revokeRolePermission.useMutation({
    onSettled: async () => {
      if (!workspace.publicId) return;
      await utils.permission.getWorkspaceRolePermissions.invalidate({
        workspacePublicId: workspace.publicId,
      });
    },
  });

  const isBusy = grantMutation.isPending || revokeMutation.isPending;

  const handleToggle = (
    rolePublicId: string,
    permission: Permission,
    checked: boolean,
  ) => {
    if (!workspace.publicId || !rolePublicId) return;

    if (checked) {
      grantMutation.mutate({
        workspacePublicId: workspace.publicId,
        rolePublicId,
        permission,
      });
    } else {
      revokeMutation.mutate({
        workspacePublicId: workspace.publicId,
        rolePublicId,
        permission,
      });
    }
  };

  return (
    <div className="mt-2">
      {orderedRoleNames.length === 0 && !isLoading ? (
        <p className="mb-4 text-sm text-neutral-500 dark:text-dark-800">
          {t`Chưa có vai trò nào cho không gian làm việc này.`}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-light-300 bg-light-50 dark:border-dark-300 dark:bg-dark-100">
        <table className="min-w-full table-fixed divide-y divide-light-600 overflow-visible text-left text-sm dark:divide-dark-600">
          <thead className="rounded-t-lg bg-light-300 dark:bg-dark-300">
            <tr>
              <th className="w-1/2 rounded-tl-lg px-4 py-3 text-left text-xs font-semibold tracking-wide text-neutral-900 dark:text-dark-900">
                {t`Quyền hạn`}
              </th>
              {orderedRoleNames.map((role) => (
                <th
                  key={role}
                  className="w-1/6 px-4 py-3 text-center text-xs font-semibold tracking-wide text-neutral-900 dark:text-dark-900"
                >
                  {formatRoleLabel(role)}
                </th>
              ))}
            </tr>
          </thead>
          {Object.values(permissionCategories).map((category) => (
            <tbody
              key={category.label}
              className="divide-y divide-light-600 overflow-visible bg-light-50 dark:divide-dark-600 dark:bg-dark-100"
            >
              <tr className="bg-light-100 dark:bg-dark-200">
                <td
                  colSpan={1 + orderedRoleNames.length}
                  className="px-4 py-2 text-xs font-semibold tracking-wide text-neutral-900 dark:text-dark-900"
                >
                  {category.label}
                </td>
              </tr>
              {category.permissions.map((permission) => (
                <tr key={permission}>
                  <td className="w-1/2 px-4 py-2 text-sm text-light-900 dark:text-dark-900">
                    {permissionLabels[permission] ?? permission}
                  </td>
                  {orderedRoleNames.map((roleName) => {
                    const role = systemRoles.find((r) => r.name === roleName);
                    const checked = role?.permissions.includes(permission);
                    const isAdminRole = roleName === "ADMIN";
                    const isBillingOrDeletePermission =
                      permission === "workspace:manage" ||
                      permission === "workspace:delete";

                    return (
                      <td
                        key={roleName}
                        className="w-1/6 px-4 py-2 text-center align-middle"
                      >
                        <input
                          type="checkbox"
                          className="h-[16px] w-[16px] appearance-none rounded-md border border-light-500 bg-transparent outline-none ring-0 checked:bg-blue-600 focus:shadow-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none dark:border-dark-500 dark:hover:border-dark-500 disabled:opacity-60"
                          disabled={
                            isAdminRole ||
                            isBillingOrDeletePermission ||
                            !role ||
                            isLoading ||
                            isBusy
                          }
                          checked={!!checked}
                          onChange={(e) =>
                            !isAdminRole &&
                            !isBillingOrDeletePermission &&
                            role &&
                            handleToggle(
                              role.publicId,
                              permission,
                              e.target.checked,
                            )
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

