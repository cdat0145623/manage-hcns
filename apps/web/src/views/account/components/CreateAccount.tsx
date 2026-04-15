import React, { useState } from "react";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";

import { api } from "~/utils/api";
import Input from "~/components/Input";
import Button from "~/components/Button";
import { HiXMark } from "react-icons/hi2";
import { useWorkspace } from "~/providers/workspace";
import { PositionSelect } from "~/views/members/components/PositionSelector";
import { RoleSelect } from "~/views/members/components/RoleSelector";

const ROLES = ["ADMIN", "AREA_MANAGER", "BRANCH_MANAGER", "NVVP"] as const;

export default function CreateAccount({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data: user, isLoading: isUserLoading } = api.user.getUser.useQuery();
  const createMutation = api.user.create.useMutation();
  const { workspace } = useWorkspace();
  const { data: positions } = api.position.all.useQuery();

  const [form, setForm] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    role: "NVVP" as typeof ROLES[number],
    workspacePublicId: workspace?.publicId ?? "",
    position: positions?.find(p => p.name === "Nhân viên văn phòng")?.publicId ?? "",
  });
  
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (isUserLoading) {
    return <div className="p-8 text-center text-light-1000 dark:text-dark-1000">{t`Đang tải...`}</div>;
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-lg bg-light-50 p-8 shadow-md dark:bg-dark-300">
        <h2 className="text-center text-lg font-semibold text-red-500">
          {t`Bạn không có quyền truy cập trang này.`}
        </h2>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name || !form.email || !form.username || !form.password || !form.role) {
      setError(t`Vui lòng nhập đầy đủ thông tin.`);
      return;
    }

    if (form.username.length < 3 || form.username.length > 25) {
        setError(t`Tên đăng nhập phải từ 3 đến 25 ký tự.`);
        return;
    }

    if (form.password.length < 8) {
        setError(t`Mật khẩu phải có ít nhất 8 ký tự.`);
        return;
    }

    if (form.password !== form.confirmPassword) {
      setError(t`Mật khẩu không khớp.`);
      return;
    }

    if (!form.position) {
      setError(t`Vui lòng chọn vị trí.`);
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: form.name,
        email: form.email,
        username: form.username,
        password: form.password,
        role: form.role as any,
        workspacePublicId: workspace?.publicId ?? "",
        positionPublicId: form.position,
      });
      setSuccess(t`Tạo tài khoản thành công!`);
      setForm({
        name: "",
        email: "",
        username: "",
        password: "",
        confirmPassword: "",
        role: "NVVP",
        workspacePublicId: workspace?.publicId ?? "",
        position: positions?.find(p => p.name === "Nhân viên văn phòng")?.publicId ?? "",
      });
      onClose();
    } catch (err: any) {
      setError(err.message || t`Đã có lỗi xảy ra.`);
    }
  };

  return (
    <div className="mx-auto w-full rounded-lg bg-light-50 p-6 shadow-md dark:bg-dark-300">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-light-1000 dark:text-dark-1000">
          {t`Tạo tài khoản mới`}
        </h1>
        <Button onClick={onClose}><HiXMark className="h-5 w-5" /></Button>
      </div>
      
      {error && (
        <div className="mb-4 rounded bg-red-100 p-3 text-sm text-red-600 dark:bg-red-500/20 dark:text-red-400">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 rounded bg-green-100 p-3 text-sm text-green-600 dark:bg-green-500/20 dark:text-green-400">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-row gap-2">
            <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-light-1000 dark:text-dark-1000">
                    {t`Họ tên`}
                </label>
                <Input 
                    value={form.name} 
                    onChange={(e) => setForm({ ...form, name: e.target.value })} 
                    placeholder={t`Nhập họ tên`}
                />
            </div>
            
            <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-light-1000 dark:text-dark-1000">
                    {t`Email`}
                </label>
                <Input 
                    type="email"
                    value={form.email} 
                    onChange={(e) => setForm({ ...form, email: e.target.value })} 
                    placeholder={t`Nhập email`}
                />
            </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-light-1000 dark:text-dark-1000">
            {t`Tên đăng nhập`}
          </label>
          <Input 
            value={form.username} 
            onChange={(e) => setForm({ ...form, username: e.target.value })} 
            placeholder={t`Nhập tên đăng nhập`}
          />
        </div>

        <div className="flex flex-row gap-2">
            <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-light-1000 dark:text-dark-1000">
                    {t`Mật khẩu`}
                </label>
                <Input 
                    type="password"
                    value={form.password} 
                    onChange={(e) => setForm({ ...form, password: e.target.value })} 
                    placeholder={t`Nhập mật khẩu`}
                />
            </div>

            <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-light-1000 dark:text-dark-1000">
                    {t`Xác nhận mật khẩu`}
                </label>
                <Input 
                    type="password"
                    value={form.confirmPassword} 
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} 
                    placeholder={t`Nhập mật khẩu`}
                />
            </div>
        </div>

        <div className="flex flex-row gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-light-1000 dark:text-dark-1000">
              {t`Vai trò`}
            </label>
            <RoleSelect 
              value={form.role} 
              onChange={(val) => setForm({ ...form, role: val })}
            />
          </div>

          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-light-1000 dark:text-dark-1000">
              {t`Vị trí`}
            </label>
            <PositionSelect 
              value={form.position} 
              onChange={(val) => setForm({ ...form, position: val })}
            />
          </div>
        </div>

        <div className="mt-4">
          <Button type="submit" isLoading={createMutation.isPending} fullWidth>
            {t`Tạo tài khoản`}
          </Button>
        </div>
      </form>
    </div>
  );
}
