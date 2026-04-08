import { t } from "@lingui/core/macro";
import { useRef, useState } from "react";
import { HiOutlinePaperClip } from "react-icons/hi";
import { HiCheckBadge } from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { invalidateCard, invalidateTaskInstance } from "~/utils/cardInvalidation";

export function AttachmentUpload({ 
  cardPublicId,
  taskInstanceId,
}: { 
  cardPublicId?: string;
  taskInstanceId?: string;
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
        header: t`File too large`,
        message: t`Maximum file size is 50MB.`,
        icon: "error",
      });
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Step 1: Generate Presigned URL
      const { url, key: s3Key } = await generateUrl.mutateAsync({
        cardPublicId,
        taskInstanceId,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });

      // Step 2: Upload directly to S3 (proxied via middleware)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
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

      // Step 3: Confirm upload in DB
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
        header: t`Attachment uploaded`,
        message: t`Your file has been uploaded to MinIO successfully.`,
        icon: "success",
      });
    } catch (error) {
      console.error("Upload failed", error);
      showPopup({
        header: t`Upload failed`,
        message: t`Failed to upload attachment to MinIO. Please check your connection.`,
        icon: "error",
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input
    event.target.value = "";

    void uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Upload the first file (or could upload all files)
    void uploadFile(files[0] ?? new File([], ""));
  };

  return (
    <div className="mb-6">
      <input
        ref={inputRef}
        type="file"
        id="attachment-upload"
        className="hidden"
        onChange={handleFileSelect}
        disabled={uploading}
      />
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={twMerge(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-all duration-200 cursor-pointer overflow-hidden",
          isDragging
            ? "border-brand-500 bg-brand-50/50 dark:border-brand-400 dark:bg-brand-900/20 scale-[1.02]"
            : "border-light-300 hover:border-light-400 bg-light-50 hover:bg-light-100 dark:border-dark-300 dark:bg-dark-50 dark:hover:border-dark-400 dark:hover:bg-dark-100/50"
        )}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <div className="flex flex-col items-center justify-center text-center gap-2 z-10">
          <div className="rounded-full bg-light-200 dark:bg-dark-200 p-3 text-light-700 dark:text-dark-700">
            <HiOutlinePaperClip className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-light-1000 dark:text-dark-1000">
            {t`Nhấp chuột hoặc kéo tệp vào khu vực này để tải lên`}
          </p>
          <p className="text-xs text-light-600 dark:text-dark-600">
            {t`Hỗ trợ tải lên một hoặc nhiều tệp. Kích thước tệp tối đa là 50MB.`}
          </p>
        </div>

        {uploading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/90 dark:bg-dark-50/90 backdrop-blur-sm p-6">
            <div className="w-full max-w-[200px] flex flex-col gap-2">
              <div className="flex justify-between text-xs font-medium text-light-800 dark:text-dark-800">
                <span>{t`Uploading...`}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-light-200 dark:bg-dark-200">
                <div 
                  className="h-full bg-brand-500 transition-all duration-300 ease-out dark:bg-brand-400"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="secondary"
          className="text-xs font-medium"
          iconLeft={
            <HiCheckBadge className="h-4 w-4" />
          }
          onClick={() => openModal("ADD_CHECKLIST")}
        >
          {t`Thêm Checklist`}
        </Button>
      </div>
    </div>
  );
}
