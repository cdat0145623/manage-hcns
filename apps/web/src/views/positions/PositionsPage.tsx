import { t } from "@lingui/core/macro";
import {
  HiOutlinePlusSmall,
  HiEllipsisHorizontal,
  HiOutlineBriefcase,
} from "react-icons/hi2";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

import Button from "~/components/Button";
import Dropdown from "~/components/Dropdown";
import Modal from "~/components/modal";
import { PageHead } from "~/components/PageHead";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import Input from "~/components/Input";

interface Position {
  publicId: string;
  name: string;
  description: string | null;
}

const PositionTableRow = ({
  position,
  isLastRow,
  onEdit,
  onDelete,
}: {
  position: Position;
  isLastRow?: boolean;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
}) => {
  return (
    <tr className="rounded-b-lg">
      <td className={twMerge("w-1/3 p-4 text-sm font-medium text-neutral-900 dark:text-dark-1000", isLastRow && "rounded-bl-lg")}>
        {position.name}
      </td>
      <td className="w-1/2 p-4 text-sm text-dark-900 truncate max-w-[300px]">
        {position.description || <span className="italic text-neutral-400">{t`No description`}</span>}
      </td>
      <td className={twMerge("w-auto p-4 text-right", isLastRow && "rounded-br-lg")}>
        <Dropdown
          items={[
            {
              label: t`Sửa`,
              action: () => onEdit(position),
            },
            {
              label: t`Xóa`,
              action: () => onDelete(position),
            },
          ]}
        >
          <HiEllipsisHorizontal size={20} className="text-light-900 dark:text-dark-900 cursor-pointer inline-block" />
        </Dropdown>
      </td>
    </tr>
  );
};

export function PositionsPage() {
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const { data: positions, isLoading } = api.position.all.useQuery();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [deletingPosition, setDeletingPosition] = useState<Position | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = api.position.create.useMutation({
    onSuccess: () => {
      void utils.position.all.invalidate();
      closeModal();
      showPopup({ header: t`Success`, message: t`Position created successfully`, icon: "success" });
    },
    onError: (err) => {
      showPopup({ header: t`Error`, message: err.message, icon: "error" });
    },
  });

  const updateMutation = api.position.update.useMutation({
    onSuccess: () => {
      void utils.position.all.invalidate();
      closeModal();
      showPopup({ header: t`Success`, message: t`Position updated successfully`, icon: "success" });
    },
    onError: (err) => {
      showPopup({ header: t`Error`, message: err.message, icon: "error" });
    },
  });

  const deleteMutation = api.position.delete.useMutation({
    onSuccess: () => {
      void utils.position.all.invalidate();
      setIsDeleteModalOpen(false);
      setDeletingPosition(null);
      showPopup({ header: t`Success`, message: t`Position deleted successfully`, icon: "success" });
    },
    onError: (err) => {
      showPopup({ header: t`Error`, message: err.message, icon: "error" });
    },
  });

  const handleCreateOrUpdate = () => {
    if (!name.trim()) return;

    if (editingPosition) {
      updateMutation.mutate({
        publicId: editingPosition.publicId,
        name,
        description: description || null,
      });
    } else {
      createMutation.mutate({
        name,
        description: description || null,
      });
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPosition(null);
    setName("");
    setDescription("");
  };

  const openEditModal = (pos: Position) => {
    setEditingPosition(pos);
    setName(pos.name);
    setDescription(pos.description || "");
    setIsModalOpen(true);
  };

  const openDeleteModal = (pos: Position) => {
    setDeletingPosition(pos);
    setIsDeleteModalOpen(true);
  };

  return (
    <>
      <PageHead title={t`Vị trí công việc`} />
      <div className="m-auto h-full max-w-[1100px] p-6 px-5 md:px-28 md:py-12">
        <div className="mb-8 flex w-full justify-between items-center">
          <div className="flex items-center gap-3">
            <HiOutlineBriefcase className="h-6 w-6 text-neutral-900 dark:text-dark-1000" />
            <h1 className="font-bold tracking-tight text-neutral-900 dark:text-dark-1000 sm:text-[1.2rem]">
              {t`Vị trí công việc`}
            </h1>
          </div>
          <Button
            onClick={() => setIsModalOpen(true)}
            iconLeft={<HiOutlinePlusSmall className="h-4 w-4" />}
          >
            {t`Thêm vị trí`}
          </Button>
        </div>

        <div className="mt-8 flow-root">
          <div className="-mx-4 -my-2 sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
              <div className="shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <table className="min-w-full divide-y divide-light-600 dark:divide-dark-600">
                  <thead className="bg-light-300 dark:bg-dark-200">
                    <tr>
                      <th className="px-4 py-3.5 text-left text-sm font-semibold text-light-900 dark:text-dark-900">
                        {t`Tên vị trí`}
                      </th>
                      <th className="px-4 py-3.5 text-left text-sm font-semibold text-light-900 dark:text-dark-900">
                        {t`Mô tả`}
                      </th>
                      <th className="px-4 py-3.5 text-right text-sm font-semibold text-light-900 dark:text-dark-900">
                        {t`Hành động`}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light-600 bg-light-50 dark:divide-dark-600 dark:bg-dark-100">
                    {!isLoading && positions?.map((pos, index) => (
                      <PositionTableRow
                        key={pos.publicId}
                        position={pos}
                        isLastRow={index === positions.length - 1}
                        onEdit={openEditModal}
                        onDelete={openDeleteModal}
                      />
                    ))}
                    {!isLoading && positions?.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-sm text-neutral-500 italic">
                          {t`Chưa có vị trí nào được tạo.`}
                        </td>
                      </tr>
                    )}
                    {isLoading && (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-sm text-neutral-500">
                          {t`Đang tải...`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Create/Edit Modal */}
        <Modal isVisible={isModalOpen} onClose={closeModal} modalSize="sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-dark-1000 mb-4">
              {editingPosition ? t`Sửa vị trí` : t`Thêm vị trí mới`}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-dark-900 mb-1">
                  {t`Tên vị trí`}
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t`VD: Nhân viên Tự động hóa`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-dark-900 mb-1">
                  {t`Mô tả`}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-light-400 bg-transparent p-2 text-sm outline-none focus:border-light-1000 dark:border-dark-400 dark:focus:border-dark-1000"
                  placeholder={t`Mô tả ngắn gọn về vị trí này...`}
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="secondary" onClick={closeModal}>
                  {t`Hủy`}
                </Button>
                <Button
                  onClick={handleCreateOrUpdate}
                  disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
                >
                  {editingPosition ? t`Cập nhật` : t`Tạo mới`}
                </Button>
              </div>
            </div>
          </div>
        </Modal>

        {/* Delete Modal */}
        <Modal isVisible={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} modalSize="sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-dark-1000 mb-2">
              {t`Xác nhận xóa`}
            </h2>
            <p className="text-sm text-dark-900 mb-6">
              {t`Bạn có chắc chắn muốn xóa vị trí`} <strong>{deletingPosition?.name}</strong> {t`không? Các người dùng thuộc vị trí này sẽ bị để trống vị trí.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
                {t`Hủy`}
              </Button>
              <Button
                variant="danger"
                onClick={() => deletingPosition && deleteMutation.mutate({ publicId: deletingPosition.publicId })}
                disabled={deleteMutation.isPending}
              >
                {t`Xóa`}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
}
