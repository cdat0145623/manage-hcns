import Link from "next/link";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useState } from "react";
import { HiOutlinePlusSmall, HiOutlineRectangleStack } from "react-icons/hi2";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { PageHead } from "~/components/PageHead";
import PatternedBackground from "~/components/PatternedBackground";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

export default function ProjectsView() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const boards = api.projectBoard.all.useQuery({
    workspacePublicId: workspace.publicId,
  });
  const createBoard = api.projectBoard.create.useMutation({
    onSuccess: async (board) => {
      await utils.projectBoard.all.invalidate();
      setName("");
      setProjectCode("");
      setDescription("");
      setIsCreating(false);
      await router.push(`/projects/${board.publicId}`);
    },
    onError: (error) =>
      showPopup({
        header: t`Không thể tạo project board`,
        message: error.message,
        icon: "error",
      }),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    createBoard.mutate({
      workspacePublicId: workspace.publicId,
      name: trimmedName,
      projectCode: projectCode.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <>
      <PageHead title={t`Projects | ${workspace.name}`} />
      <div className="mx-auto h-full max-w-[1100px] p-6 md:p-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-dark-1000">
              {t`Projects`}
            </h1>
            <p className="mt-1 text-sm text-light-800 dark:text-dark-800">
              {t`Quản lý Scrum và các dự án cộng tác.`}
            </p>
          </div>
          <Button
            type="button"
            iconLeft={<HiOutlinePlusSmall className="h-4 w-4" />}
            onClick={() => setIsCreating((value) => !value)}
          >
            {t`Tạo board`}
          </Button>
        </div>

        {isCreating && (
          <form
            onSubmit={submit}
            className="mb-8 rounded-lg border border-light-300 bg-light-50 p-5 shadow-sm dark:border-dark-300 dark:bg-dark-100"
          >
            <h2 className="mb-4 font-semibold text-neutral-900 dark:text-dark-1000">
              {t`Project board mới`}
            </h2>
            <div className="space-y-3">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t`Tên board`}
                autoFocus
              />
              <Input
                value={projectCode}
                onChange={(event) =>
                  setProjectCode(event.target.value.toUpperCase())
                }
                placeholder={t`Mã project (VD: PRO)`}
                maxLength={10}
                title={t`Mã project dùng để tạo mã card, ví dụ PRO-1`}
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t`Mô tả (không bắt buộc)`}
                rows={3}
                className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-neutral-900 ring-1 ring-inset ring-light-400 focus:ring-2 focus:ring-inset focus:ring-light-700 dark:bg-dark-200 dark:text-dark-1000 dark:ring-dark-500"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsCreating(false)}
              >
                {t`Hủy`}
              </Button>
              <Button
                type="submit"
                disabled={createBoard.isPending || !name.trim()}
              >
                {createBoard.isPending ? t`Đang tạo...` : t`Tạo board`}
              </Button>
            </div>
          </form>
        )}

        {boards.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-36 animate-pulse rounded-lg bg-light-200 dark:bg-dark-200"
              />
            ))}
          </div>
        ) : boards.data?.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {boards.data.map((board) => (
              <Link key={board.publicId} href={`/projects/${board.publicId}`}>
                <div className="group relative h-36 overflow-hidden rounded-lg border border-light-300 bg-light-50 p-5 shadow-sm transition hover:bg-light-100 dark:border-dark-300 dark:bg-dark-100 dark:hover:bg-dark-200">
                  <PatternedBackground />
                  <div className="relative z-10">
                    <HiOutlineRectangleStack className="mb-4 h-6 w-6 text-light-800 dark:text-dark-700" />
                    <h2 className="truncate font-semibold text-neutral-900 dark:text-dark-1000">
                      {board.name}
                    </h2>
                    <p className="mt-1 line-clamp-1 text-xs text-light-800 dark:text-dark-800">
                      {board.description ?? t`Không có mô tả`}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-light-400 p-8 text-center dark:border-dark-500">
            <HiOutlineRectangleStack className="h-10 w-10 text-light-700 dark:text-dark-700" />
            <p className="mt-3 font-semibold text-neutral-900 dark:text-dark-1000">
              {t`Chưa có project board`}
            </p>
            <p className="mt-1 text-sm text-light-800 dark:text-dark-800">
              {t`Tạo board đầu tiên để bắt đầu quản lý dự án.`}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
