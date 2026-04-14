import { useState } from "react";
import { t } from "@lingui/core/macro";
import {
  HiEllipsisHorizontal,
  HiPencilSquare,
  HiNoSymbol,
  HiPlus
} from "react-icons/hi2";

import type { Role } from "@kan/shared";
import Button from "~/components/Button";

import { PageHead } from "~/components/PageHead";
import Dropdown from "~/components/Dropdown";
import Modal from "~/components/modal";
import { useWorkspace } from "~/providers/workspace";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { RoleSelect } from "~/views/members/components/RoleSelector";
import { PositionSelect } from "~/views/members/components/PositionSelector";
import { EditAccountModal } from "./components/EditAccountModal";
import CreateAccount from "./components/CreateAccount";

interface MemberData {
  publicId: string;
  email: string | null;
  role: Role;
  status: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    username: string | null;
    isActive: boolean;
    position: {
      id: number;
      publicId: string;
      name: string;
      description: string | null;
      deletedAt: Date | null;
    } | null;
  } | null;
}

interface AccountTableRowProps {
  member: MemberData;
  isLastRow: boolean;
  onEdit: (member: MemberData) => void;
  onUpdateStatus: (member: MemberData, isActive: boolean, workspacePublicId: string) => void;
}

function AccountTableRow({
  member,
  isLastRow,
  onEdit,
  onUpdateStatus,
}: AccountTableRowProps) {
  const { workspace, hasLoaded } = useWorkspace();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const updateRoleMutation = api.member.updateRole.useMutation({
    onSuccess: async () => {
      if (hasLoaded && workspace.publicId && workspace.publicId.length >= 12) {
        await utils.workspace.byId.invalidate({
          workspacePublicId: workspace.publicId,
        });
      }
      showPopup({
        header: t`Cập nhật vai trò`,
        message: t`Vai trò đã được cập nhật thành công.`,
        icon: "success",
      });
    },
    onError: () => {
      showPopup({
        header: t`Lỗi cập nhật vai trò`,
        message: t`Không thể cập nhật vai trò. Vui lòng thử lại.`,
        icon: "error",
      });
    },
  });

  const handleRoleChange = (newRole: Role) => {
    if (!member.publicId) return;
    updateRoleMutation.mutate({
      workspacePublicId: workspace.publicId,
      memberPublicId: member.publicId,
      role: newRole,
    });
  };

  const updatePositionMutation = api.user.updatePosition.useMutation({
    onSuccess: async () => {
      if (hasLoaded && workspace.publicId && workspace.publicId.length >= 12) {
        await utils.workspace.byId.invalidate({
          workspacePublicId: workspace.publicId,
        });
      }
      showPopup({
        header: t`Cập nhật vị trí`,
        message: t`Vị trí đã được cập nhật thành công.`,
        icon: "success",
      });
    },
    onError: () => {
      showPopup({
        header: t`Lỗi cập nhật vị trí`,
        message: t`Không thể cập nhật vị trí. Vui lòng thử lại.`,
        icon: "error",
      });
    },
  })

  const handlePositionChange = (publicId: string) => {
    if (!member.user) return;

    updatePositionMutation.mutate({
      targetUserId: member.user.id,
      positionPublicId: publicId,
      workspacePublicId: workspace.publicId
    })
  }

  return (
    <tr
      className={`border-b border-light-600 dark:border-dark-600 ${isLastRow ? "border-b-0" : ""}`}
    >
      {/* Name */}
      <td className={`px-4 py-3 ${isLastRow ? "rounded-bl-lg" : ""}`}>
        <span className="text-sm font-medium text-neutral-900 dark:text-white">
          {member.user?.name ?? "—"}
        </span>
      </td>

      {/* Username */}
      <td className="px-4 py-3">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {member.user?.username ?? "—"}
        </span>
      </td>

      {/* Email */}
      <td className="px-4 py-3">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {member.user?.email ?? member.email ?? "—"}
        </span>
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        <div className="inline-flex items-center">
          <RoleSelect
            value={member.role ?? "NVVP"}
            onChange={handleRoleChange}
            disabled={updateRoleMutation.isPending}
          />
        </div>
      </td>

      {/* Position */}
      <td className="px-4 py-3">
        <div className="inline-flex items-center">
          <PositionSelect
            value={member.user?.position?.publicId ?? ""}
            onChange={handlePositionChange}
            disabled={updatePositionMutation.isPending}
          />
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {member.user?.isActive ? "Hoạt động" : "Không hoạt động"}
        </span>
      </td>

      {/* Actions */}
      <td className={`px-4 py-3 ${isLastRow ? "rounded-br-lg" : ""}`}>
        <Dropdown
          items={[
            {
              label: t`Chỉnh sửa tài khoản`,
              icon: <HiPencilSquare className="h-4 w-4" />,
              action: () => onEdit(member),
            },
            {
              label: member.user?.isActive ? t`Vô hiệu hóa tài khoản` : t`Kích hoạt tài khoản`,
              icon: <HiNoSymbol className="h-4 w-4" />,
              action: () => onUpdateStatus(member, !member.user?.isActive, workspace.publicId),
            },
          ]}
        >
          <HiEllipsisHorizontal
            size={20}
            className="text-light-900 dark:text-dark-900"
          />
        </Dropdown>
      </td>
    </tr>
  );
}

function SkeletonRow({ isLastRow }: { isLastRow?: boolean }) {
  return (
    <tr
      className={`border-b border-light-600 dark:border-dark-600 ${isLastRow ? "border-b-0" : ""}`}
    >
      <td className={`px-4 py-3 ${isLastRow ? "rounded-bl-lg" : ""}`}>
        <div className="h-4 w-24 animate-pulse rounded bg-light-200 dark:bg-dark-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-20 animate-pulse rounded bg-light-200 dark:bg-dark-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-32 animate-pulse rounded bg-light-200 dark:bg-dark-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-8 w-36 animate-pulse rounded-xl bg-light-200 dark:bg-dark-200" />
      </td>
      <td className={`px-4 py-3 ${isLastRow ? "rounded-br-lg" : ""}`}>
        <div className="h-7 w-7 animate-pulse rounded bg-light-200 dark:bg-dark-200" />
      </td>
    </tr>
  );
}

export default function Account() {
  const { workspace, hasLoaded } = useWorkspace();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const { data, isLoading } = api.workspace.byId.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: hasLoaded && !!workspace.publicId && workspace.publicId.length >= 12 },
  );

  const [editingMember, setEditingMember] = useState<MemberData | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const updateStatusUser = api.user.updateStatus.useMutation({
    onSuccess: async () => {
      if (hasLoaded && workspace.publicId && workspace.publicId.length >= 12) {
        await utils.workspace.byId.invalidate({
          workspacePublicId: workspace.publicId,
        });
      }
      showPopup({
        header: t`Cập nhật trạng thái tài khoản`,
        message: t`Tài khoản đã được cập nhật trạng thái thành công.`,
        icon: "success",
      });
    },
    onError: () => {
      showPopup({
        header: t`Lỗi`,
        message: t`Không thể vô hiệu hóa tài khoản. Vui lòng thử lại.`,
        icon: "error",
      });
    },
  });

  const handleEdit = (member: MemberData) => {
    setEditingMember(member);
    setShowEditModal(true);
  };

  const handleUpdateStatus = (member: MemberData, isActive: boolean, workspacePublicId: string) => {
    if (!member.user?.id) return;
    if (confirm(t`Bạn có chắc chắn muốn ${isActive ? "kích hoạt" : "vô hiệu hóa"} tài khoản này?`)) {
      updateStatusUser.mutate({ targetUserId: member.user.id, isActive, workspacePublicId });
    }
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingMember(null);
  };

  const members = data?.members ?? [];

  return (
    <>
      <PageHead title={t`Tài khoản | ${workspace.name ?? t`Workspace`}`} />
      <div className="m-auto h-full w-full p-6 px-5 lg:px-18 lg:py-12">
        <div className="mb-8 flex w-full justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-bold tracking-tight text-neutral-900 dark:text-dark-1000 sm:text-[1.2rem]">
              {t`Quản lý tài khoản`}
            </h1>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            iconLeft={<HiPlus className="h-4 w-4" />}
            disabled={workspace.role !== "ADMIN"}
            >
            {t`Thêm`}
          </Button>
        </div>

        <div className="mt-8 flow-root">
          <div className="-mx-4 -my-2 sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full overflow-x-auto px-4 py-2 pb-16 align-middle sm:px-6 lg:px-8">
              <div className="h-full shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <table className="min-w-full divide-y divide-light-600 overflow-visible dark:divide-dark-600">
                  <thead className="rounded-t-lg bg-light-300 dark:bg-dark-200">
                    <tr>
                      <th
                        scope="col"
                        className="rounded-tl-lg px-4 py-3.5 text-left text-sm font-semibold text-light-900 dark:text-dark-900"
                      >
                        {t`Tên`}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3.5 text-left text-sm font-semibold text-light-900 dark:text-dark-900"
                      >
                        {t`Tên đăng nhập`}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3.5 text-left text-sm font-semibold text-light-900 dark:text-dark-900"
                      >
                        {t`Email`}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3.5 text-left text-sm font-semibold text-light-900 dark:text-dark-900"
                      >
                        {t`Vai trò`}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3.5 text-left text-sm font-semibold text-light-900 dark:text-dark-900"
                      >
                        {t`Vị trí`}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3.5 text-left text-sm font-semibold text-light-900 dark:text-dark-900"
                      >
                        {t`Trạng thái`}
                      </th>
                      <th
                        scope="col"
                        className="rounded-tr-lg px-4 py-3.5 text-left text-sm font-semibold text-light-900 dark:text-dark-900"
                      >
                        {t`Hành động`}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light-600 overflow-visible bg-light-50 dark:divide-dark-600 dark:bg-dark-100">
                    {!isLoading &&
                      members.map((member, index) => (
                        <AccountTableRow
                          key={member.publicId}
                          member={member as MemberData}
                          isLastRow={index === members.length - 1}
                          onEdit={handleEdit}
                          onUpdateStatus={handleUpdateStatus}
                        />
                      ))}

                    {isLoading && (
                      <>
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow isLastRow />
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Account Modal */}
      {showEditModal && editingMember && (
        <Modal
        //   widthCustom="w-[40vw]"
          isVisible={showEditModal}
          closeOnClickOutside
          centered
        >
          <EditAccountModal
            memberId={editingMember.user?.id ?? ""}
            memberPublicId={editingMember.publicId}
            memberName={editingMember.user?.name ?? ""}
            memberUsername={editingMember.user?.username ?? ""}
            memberEmail={editingMember.user?.email ?? editingMember.email ?? ""}
            memberRole={editingMember.role as Role}
            onClose={handleCloseEditModal}
          />
        </Modal>
      )}

      {/* Create Account Modal */}
      {showCreateModal && (
        <Modal
        //   widthCustom="w-[40vw]"
          isVisible={showCreateModal}
          closeOnClickOutside
          centered
        >
          <CreateAccount onClose={() => setShowCreateModal(false)} />
        </Modal>
      )}
    </>
  );
}