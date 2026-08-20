import { t } from "@lingui/core/macro";
import { useRef, useState } from "react";
import { HiCheckBadge, HiOutlinePaperClip } from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import {
  invalidateCard,
  invalidateTaskInstance,
} from "~/utils/cardInvalidation";

export function AttachmentUpload({
  cardPublicId,
  taskInstanceId,
  hideChecklistButton = false,
  onUploaded,
}: {
  cardPublicId?: string;
  taskInstanceId?: string;
  hideChecklistButton?: boolean;
  onUploaded?: () => void | Promise<void>;
}) {
  const { openModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const generateUrl = api.attachment.generateUploadUrl.useMutation();
  const confirmUpload = api.attachment.confirm.useMutation();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploadFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      showPopup({
        header: t`Tệp quá lớn`,
        message: t`Kích thước tối đa là 50MB.`,
        icon: "error",
      });
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const { url, key: s3Key } = await generateUrl.mutateAsync({
        cardPublicId,
        taskInstanceId,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.setRequestHeader(
          "Content-Type",
          file.type || "application/octet-stream",
        );

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round(
              (event.loaded / event.total) * 100,
            );
            setProgress(percentComplete);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`S3 Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during S3 upload"));
        xhr.send(file);
      });

      await confirmUpload.mutateAsync({
        cardPublicId,
        taskInstanceId,
        s3Key,
        filename: s3Key.split("/").pop() ?? file.name,
        originalFilename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });

      if (cardPublicId) {
        void invalidateCard(utils, cardPublicId);
      } else if (taskInstanceId) {
        void invalidateTaskInstance(utils, taskInstanceId);
      }

      showPopup({
        header: t`Đã tải lên`,
        message: t`Tài liệu của bạn đã được tải lên thành công.`,
        icon: "success",
      });
      await onUploaded?.();
    } catch (error) {
      console.error("Upload failed", error);
      showPopup({
        header: t`Tải lên thất bại`,
        message: t`Không thể tải tài liệu lên. Vui lòng kiểm tra lại kết nối.`,
        icon: "error",
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    void uploadFile(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        disabled={uploading}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleFileDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={twMerge(
          "group relative flex min-h-[150px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300",
          isDragging
            ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20 scale-[1.02]"
            : "hover:border-brand-400 hover:bg-brand-50/10 dark:hover:border-brand-400 border-light-300 bg-white dark:border-dark-400 dark:bg-dark-200/50",
          uploading && "cursor-not-allowed opacity-80",
        )}
      >
        <div className="flex flex-col items-center justify-center space-y-4 px-6 text-center">
          <div
            className={twMerge(
              "bg-brand-50 text-brand-600 group-hover:bg-brand-100 dark:bg-brand-900/20 dark:text-brand-400 flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm transition-all duration-300 group-hover:scale-110",
              isDragging && "bg-brand-100 scale-110",
            )}
          >
            <HiOutlinePaperClip className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
              {t`Tải tài liệu lên`}
            </p>
            <p className="text-[11px] font-medium text-light-500 dark:text-dark-600">
              {t`Kéo thả hoặc nhấn để chọn tệp`}
            </p>
          </div>
        </div>

        {uploading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-white/90 p-6 backdrop-blur-[2px] dark:bg-dark-50/90">
            <div className="w-full max-w-[180px] space-y-3">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
                <span className="text-brand-500">{t`Đang tải...`}</span>
                <span className="text-light-500">{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-light-100 dark:bg-dark-200">
                <div
                  className="bg-brand-500 dark:bg-brand-400 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {!hideChecklistButton && (
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center rounded-xl border-light-200 bg-white/50 py-2.5 text-xs font-bold hover:bg-white dark:border-dark-300 dark:bg-dark-100/50 dark:hover:bg-dark-100"
            iconLeft={<HiCheckBadge className="text-brand-500 h-4 w-4" />}
            onClick={() => openModal("ADD_CHECKLIST")}
          >
            {t`Thêm Checklist`}
          </Button>
        </div>
      )}
    </div>
  );
}
