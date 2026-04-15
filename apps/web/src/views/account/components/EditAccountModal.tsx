import { useState, useEffect } from "react";
import { t } from "@lingui/core/macro";
import { HiXMark } from "react-icons/hi2";
import type { Role } from "@kan/shared";
import Input from "~/components/Input";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { RoleSelect } from "~/views/members/components/RoleSelector";
import { PositionSelect } from "~/views/members/components/PositionSelector";

interface EditAccountModalProps {
  memberId: string;
  memberPublicId: string;
  memberName: string;
  memberUsername: string;
  memberEmail: string;
  memberRole: Role;
  memberPositionPublicId?: string;
  onClose: () => void;
}

export function EditAccountModal({
  memberId,
  memberPublicId,
  memberName,
  memberUsername,
  memberEmail,
  memberRole,
  memberPositionPublicId,
  onClose,
}: EditAccountModalProps) {
  const { showPopup } = usePopup();
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  const [name, setName] = useState(memberName ?? "");
  const [username, setUsername] = useState(memberUsername ?? "");
  const [email, setEmail] = useState(memberEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>(memberRole);
  const [positionPublicId, setPositionPublicId] = useState(memberPositionPublicId ?? "");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    setName(memberName ?? "");
    setUsername(memberUsername ?? "");
    setEmail(memberEmail ?? "");
    setPassword("");
    setRole(memberRole);
    setPositionPublicId(memberPositionPublicId ?? "");
    setPasswordError("");
  }, [memberName, memberUsername, memberEmail, memberRole, memberPositionPublicId]);

  const updateUser = api.user.update.useMutation({
    onSuccess: async () => {
      if (workspace.publicId && workspace.publicId.length >= 12) {
        await utils.workspace.byId.invalidate({
          workspacePublicId: workspace.publicId,
        });
      }
      showPopup({
        header: t`Cập nhật thành công`,
        message: t`Thông tin tài khoản đã được cập nhật.`,
        icon: "success",
      });
    },
    onError: () => {
      showPopup({
        header: t`Lỗi cập nhật`,
        message: t`Không thể cập nhật thông tin. Vui lòng thử lại.`,
        icon: "error",
      });
    },
  });

  const updateRole = api.member.updateRole.useMutation({
    onSuccess: async () => {
      if (workspace.publicId && workspace.publicId.length >= 12) {
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

  const updatePosition = api.user.updatePosition.useMutation({
    onSuccess: async () => {
      if (workspace.publicId && workspace.publicId.length >= 12) {
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
  });

  const handleSave = () => {
    // Validate password if provided
    if (password && password.length < 6) {
      setPasswordError(t`Mật khẩu phải có ít nhất 6 ký tự`);
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError(t`Mật khẩu không khớp`);
      return;
    }
    setPasswordError("");

    // Check if user info changed
    const userChanges: Record<string, string> = {};
    if (name !== memberName) userChanges.name = name;
    if (username !== memberUsername) userChanges.username = username;
    if (email !== memberEmail) userChanges.email = email;
    if (password) userChanges.password = password;

    if (Object.keys(userChanges).length > 0) {
      updateUser.mutate({
        targetUserId: memberId,
        workspacePublicId: workspace.publicId,
        ...userChanges,
      });
    }

    // Check if role changed
    if (role !== memberRole) {
      updateRole.mutate({
        workspacePublicId: workspace.publicId,
        memberPublicId,
        role,
      });
    }

    // Check if position changed
    if (positionPublicId !== memberPositionPublicId) {
      updatePosition.mutate({
        targetUserId: memberId,
        positionPublicId,
        workspacePublicId: workspace.publicId,
      });
    }

    onClose();
  };

  const isPending = updateUser.isPending || updateRole.isPending || updatePosition.isPending;

  return (
    <div className="mx-auto w-full rounded-lg bg-light-50 p-6 shadow-md dark:bg-dark-300">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-light-1000 dark:text-dark-1000">
          {t`Chỉnh sửa tài khoản`}
        </h1>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <HiXMark className="h-5 w-5" />
        </button>
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* Name */}
        <div className="flex flex-row gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t`Tên`}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
              placeholder={t`Nhập tên`}
            />
          </div>

          {/* Email */}
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t`Email`}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
              placeholder={t`Nhập email`}
            />
        </div>
        </div>

        {/* Username */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t`Tên đăng nhập`}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
            placeholder={t`Nhập tên đăng nhập`}
          />
        </div>

        {/* Role & Position */}
        <div className="flex flex-row gap-4">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t`Vai trò`}
            </label>
            <RoleSelect
              value={role}
              onChange={setRole}
            />
          </div>

          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t`Vị trí`}
            </label>
            <PositionSelect
              value={positionPublicId}
              onChange={setPositionPublicId}
            />
          </div>
        </div>

        {/* Password */}
        <div className="flex flex-row gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t`Mật khẩu`}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              placeholder={t`Nhập mật khẩu`}
            />
            {passwordError && (
              <p className="mt-1 text-xs text-red-500">{passwordError}</p>
            )}
          </div>

        {/* Confirm password */}
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t`Xác nhận mật khẩu`}
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              placeholder={t`Nhập lại mật khẩu`}
            />
            {passwordError && (
              <p className="mt-1 text-xs text-red-500">{passwordError}</p>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
          {t`Chỉ nhập nếu muốn thay đổi mật khẩu (ít nhất 6 ký tự)`}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
        >
          {t`Hủy`}
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? t`Đang lưu...` : t`Lưu thay đổi`}
        </button>
      </div>
    </div>
  );
}
