import Image from "next/image";
import { Dialog, Transition } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { skipToken } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import {
  HiArchiveBox,
  HiArrowDownTray,
  HiChevronLeft,
  HiChevronRight,
  HiCodeBracket,
  HiDocument,
  HiDocumentText,
  HiFilm,
  HiOutlineTrash,
  HiPencil,
  HiPhoto,
  HiXMark,
} from "react-icons/hi2";

import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import {
  invalidateCard,
  invalidateTaskInstance,
} from "~/utils/cardInvalidation";
import { fixServerDate, getAttachmentUrl } from "~/utils/helpers";

interface Attachment {
  publicId: string;
  mimeType: string;
  newFileUrl: string;
  fileName: string;
  fileSize: number;
  createdAt: Date;
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return HiPhoto;
  if (contentType.startsWith("video/")) return HiFilm;
  if (
    contentType.includes("zip") ||
    contentType.includes("tar") ||
    contentType.includes("compressed")
  )
    return HiArchiveBox;
  if (
    contentType.includes("javascript") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("html") ||
    contentType.includes("css")
  )
    return HiCodeBracket;
  if (contentType.includes("text/")) return HiDocumentText;
  return HiDocument;
}

export function AttachmentThumbnails({
  attachments,
  cardPublicId,
  taskInstanceId,
  isReadOnly = false,
}: {
  attachments?: Attachment[];
  cardPublicId?: string;
  taskInstanceId?: string;
  isReadOnly?: boolean;
}) {
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const imageAttachments =
    attachments?.filter(
      (attachment) =>
        attachment.mimeType?.startsWith("image/") && attachment.newFileUrl,
    ) ?? [];

  const nonImageAttachments =
    attachments?.filter(
      (attachment) =>
        !attachment.mimeType?.startsWith("image/") && attachment.newFileUrl,
    ) ?? [];

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const deleteAttachment = api.attachment.delete.useMutation({
    onMutate: async (args) => {
      if (isReadOnly || !cardPublicId) return;

      await utils.card.byId.cancel({ cardPublicId });
      const currentState = utils.card.byId.getData({ cardPublicId });

      utils.card.byId.setData({ cardPublicId }, (oldCard) => {
        if (!oldCard) return oldCard;
        const updatedAttachments = oldCard.attachments.filter(
          (attachment) => attachment.publicId !== args.attachmentPublicId,
        );
        return { ...oldCard, attachments: updatedAttachments };
      });

      return { previousState: currentState };
    },
    onError: (_error, _args, context) => {
      if (isReadOnly || !cardPublicId) return;
      utils.card.byId.setData({ cardPublicId }, context?.previousState);
      showPopup({
        header: t`Unable to delete attachment`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSuccess: () => {
      if (isReadOnly) return;
      // Close viewer if the deleted image was being viewed
      setSelectedIndex(null);
    },
    onSettled: async () => {
      if (isReadOnly) return;
      if (cardPublicId) {
        await invalidateCard(utils, cardPublicId);
      } else if (taskInstanceId) {
        await invalidateTaskInstance(utils, taskInstanceId);
      }
    },
  });

  // Keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIndex(null);
      } else if (e.key === "ArrowLeft") {
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === 0 ? imageAttachments.length - 1 : prev - 1;
        });
      } else if (e.key === "ArrowRight") {
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === imageAttachments.length - 1 ? 0 : prev + 1;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, imageAttachments.length]);

  if (imageAttachments.length === 0 && nonImageAttachments.length === 0) {
    return null;
  }

  const openViewer = (index: number) => {
    setSelectedIndex(index);
  };

  const closeViewer = () => {
    setSelectedIndex(null);
  };

  const goToPrevious = () => {
    if (selectedIndex === null) return;
    const newIndex =
      selectedIndex === 0 ? imageAttachments.length - 1 : selectedIndex - 1;
    setSelectedIndex(newIndex);
  };

  const goToNext = () => {
    if (selectedIndex === null) return;
    const newIndex =
      selectedIndex === imageAttachments.length - 1 ? 0 : selectedIndex + 1;
    setSelectedIndex(newIndex);
  };

  const handleDownload = (attachment: Attachment) => {
    if (!attachment.newFileUrl) {
      showPopup({
        header: t`Download failed`,
        message: t`No download URL available for this attachment.`,
        icon: "error",
      });
      return;
    }

    const downloadUrl = `/api/download/attatchment?url=${encodeURIComponent(attachment.newFileUrl)}&filename=${encodeURIComponent(attachment.fileName ?? "attachment")}`;

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
  };

  const selectedAttachment =
    selectedIndex !== null ? imageAttachments[selectedIndex] : null;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2 pt-1">
        {imageAttachments.map((attachment, index) => {
          if (!attachment.newFileUrl) return null;
          return (
            <AttachmentThumbnail
              key={attachment.publicId}
              attachment={{
                publicId: attachment.publicId,
                url: getAttachmentUrl(
                  attachment.newFileUrl,
                  attachment.mimeType,
                ),
                originalFilename: attachment.fileName ?? "",
                contentType: attachment.mimeType ?? "",
              }}
              onClick={() => openViewer(index)}
              isImage={true}
            />
          );
        })}
      </div>

      {nonImageAttachments.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {nonImageAttachments.map((attachment) => {
            if (!attachment.newFileUrl) return null;
            return (
              <FileListItem
                key={attachment.publicId}
                attachment={attachment}
                cardPublicId={cardPublicId}
                taskInstanceId={taskInstanceId}
                isReadOnly={isReadOnly}
                onDownload={() => handleDownload(attachment)}
                onDelete={
                  isReadOnly
                    ? undefined
                    : () => {
                        deleteAttachment.mutate({
                          attachmentPublicId: attachment.publicId,
                        });
                      }
                }
              />
            );
          })}
        </div>
      )}

      <Transition.Root show={selectedIndex !== null} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => {
            // Dialog closing is handled by the background overlay click
          }}
          static
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div
              className="fixed inset-0 bg-light-50 transition-opacity dark:bg-dark-50"
              onClick={(e) => {
                // Only close if clicking directly on the background, not on buttons
                if (e.target === e.currentTarget) {
                  closeViewer();
                }
              }}
            />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            {selectedIndex !== null && selectedAttachment && (
              <div
                className="fixed left-2 top-2 z-20 flex gap-1"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {!isReadOnly && (
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteAttachment.mutate({
                        attachmentPublicId: selectedAttachment.publicId,
                      });
                    }}
                    className="rounded-full bg-light-50 p-1.5 text-light-1000 transition-colors hover:bg-light-100 focus:outline-none dark:bg-dark-50 dark:text-dark-1000 dark:hover:bg-dark-100"
                    aria-label="Delete image"
                    disabled={deleteAttachment.isPending}
                  >
                    <HiOutlineTrash className="h-4 w-4" />
                  </button>
                )}
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDownload(selectedAttachment);
                  }}
                  className="rounded-full bg-light-50 p-1.5 text-light-1000 transition-colors hover:bg-light-100 focus:outline-none dark:bg-dark-50 dark:text-dark-1000 dark:hover:bg-dark-100"
                  aria-label="Download image"
                >
                  <HiArrowDownTray className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="fixed right-2 top-2 z-20 flex gap-1">
              {imageAttachments.length > 1 && selectedIndex !== null && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToPrevious();
                  }}
                  className="rounded-full bg-light-50 p-1.5 text-light-1000 transition-colors hover:bg-light-100 focus:outline-none dark:bg-dark-50 dark:text-dark-1000 dark:hover:bg-dark-100"
                  aria-label="Previous image"
                >
                  <HiChevronLeft className="h-4 w-4" />
                </button>
              )}

              {imageAttachments.length > 1 && selectedIndex !== null && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToNext();
                  }}
                  className="rounded-full bg-light-50 p-1.5 text-light-1000 transition-colors hover:bg-light-100 focus:outline-none dark:bg-dark-50 dark:text-dark-1000 dark:hover:bg-dark-100"
                  aria-label="Next image"
                >
                  <HiChevronRight className="h-4 w-4" />
                </button>
              )}

              {selectedIndex !== null && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeViewer();
                  }}
                  className="rounded-full bg-light-50 p-1.5 text-light-1000 transition-colors hover:bg-light-100 focus:outline-none dark:bg-dark-50 dark:text-dark-1000 dark:hover:bg-dark-100"
                  aria-label="Close"
                >
                  <HiXMark className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel
                  className="relative w-full max-w-7xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {selectedAttachment?.newFileUrl && (
                    <div className="relative">
                      <div className="relative mx-auto max-h-[90vh] w-full">
                        <img
                          src={getAttachmentUrl(
                            selectedAttachment.newFileUrl,
                            selectedAttachment.mimeType,
                          )}
                          alt={selectedAttachment.fileName ?? "Attachment"}
                          className="mx-auto max-h-[90vh] w-auto object-contain"
                        />
                      </div>

                      {imageAttachments.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-[10px] text-white">
                          {selectedIndex !== null && selectedIndex + 1} /{" "}
                          {imageAttachments.length}
                        </div>
                      )}
                    </div>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}

function AttachmentThumbnail({
  attachment,
  onClick,
  isImage,
}: {
  attachment: {
    publicId: string;
    url: string;
    originalFilename: string;
    contentType: string;
  };
  onClick: () => void;
  isImage: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="relative h-16 w-16 overflow-hidden rounded-xl border border-light-300 transition-transform hover:scale-105 dark:border-dark-300"
      aria-label={`View ${attachment.originalFilename}`}
    >
      {isImage ? (
        <img
          src={attachment.url}
          alt={attachment.originalFilename}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-light-100 dark:bg-dark-100">
          <HiDocumentText className="h-6 w-6 text-light-700 dark:text-dark-700" />
        </div>
      )}
    </button>
  );
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0 || isNaN(bytes)) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i] ?? "B"}`;
}

function FileListItem({
  attachment,
  cardPublicId,
  taskInstanceId,
  isReadOnly,
  onDownload,
  onDelete,
}: {
  attachment: Attachment;
  cardPublicId?: string;
  taskInstanceId?: string;
  isReadOnly?: boolean;
  onDownload: () => void;
  onDelete?: () => void;
}) {
  const Icon = getFileIcon(attachment.mimeType);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(attachment.fileName ?? "");
  const utils = api.useUtils();
  const { showPopup } = usePopup();

  const renameAttachment = api.attachment.update.useMutation({
    onMutate: async (args) => {
      if (cardPublicId) {
        await utils.card.byId.cancel({ cardPublicId });
        const previousCard = utils.card.byId.getData({ cardPublicId });
        if (previousCard) {
          utils.card.byId.setData(
            { cardPublicId },
            {
              ...previousCard,
              attachments: previousCard.attachments.map((att) =>
                att.publicId === args.attachmentPublicId
                  ? { ...att, originalFilename: args.originalFilename }
                  : att,
              ),
            },
          );
        }
        return { previousCard };
      }
    },
    onError: (err, newAttachment, context) => {
      if (cardPublicId && context?.previousCard) {
        utils.card.byId.setData({ cardPublicId }, context.previousCard);
      }
      showPopup({
        header: t`Error renaming attachment`,
        message: t`Please try again.`,
        icon: "error",
      });
    },
    onSettled: () => {
      if (cardPublicId) {
        void utils.card.byId.invalidate({ cardPublicId });
      } else if (taskInstanceId) {
        void invalidateTaskInstance(utils, taskInstanceId);
      }
    },
  });

  const handleRenameSubmit = () => {
    if (!newName.trim() || newName === attachment.fileName) {
      setIsRenaming(false);
      setNewName(attachment.fileName ?? "");
      return;
    }
    renameAttachment.mutate({
      attachmentPublicId: attachment.publicId,
      originalFilename: newName.trim(),
    });
    setIsRenaming(false);
  };

  let formattedDate = "";
  const d = fixServerDate(attachment.createdAt);
  if (!isNaN(d.getTime())) {
    formattedDate = new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  }

  return (
    <div className="group flex w-full items-center gap-3 rounded-lg border border-light-300 bg-light-50 px-3 py-2 transition-colors hover:bg-light-100 dark:border-dark-200 dark:bg-dark-100 dark:hover:bg-dark-200">
      <div className="flex-shrink-0">
        <Icon className="h-6 w-6 text-light-700 dark:text-dark-700" />
      </div>
      <div className="min-w-0 flex-1 truncate text-sm text-light-1000 dark:text-dark-1000">
        {attachment.fileName ?? "File"}
        {/* {isRenaming ? (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") {
                setIsRenaming(false);
                setNewName(attachment.originalFilename ?? "");
              }
            }}
            autoFocus
            className="w-full rounded border border-light-300 bg-white px-2 py-0.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-dark-300 dark:bg-dark-50"
          />
        ) : (
          <span 
            className="cursor-pointer hover:underline" 
            onClick={() => {
              if (!isReadOnly) setIsRenaming(true);
            }}
          >
            {attachment.originalFilename ?? "File"}
          </span>
        )} */}
      </div>
      <div className="flex items-center gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <div className="flex flex-col items-end pr-2 text-xs text-light-500 dark:text-dark-900">
          <span>
            {attachment.fileSize != null &&
              !isNaN(attachment.fileSize) &&
              `${formatFileSize(attachment.fileSize)}`}
          </span>
          <span className="text-[10px]">{formattedDate}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="flex-shrink-0 rounded-full bg-light-100 p-1.5 text-light-1000 transition-colors hover:bg-light-200 focus:outline-none dark:bg-dark-100 dark:text-dark-950 dark:hover:bg-dark-300"
            aria-label={`Download ${attachment.fileName}`}
          >
            <HiArrowDownTray className="h-4 w-4" />
          </button>
          {/* {!isReadOnly && !isRenaming && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsRenaming(true);
              }}
              className="flex-shrink-0 rounded-full bg-light-100 p-1.5 text-light-1000 transition-colors hover:bg-light-200 focus:outline-none dark:bg-dark-100 dark:text-dark-950 dark:hover:bg-dark-300"
              aria-label={`Rename ${attachment.originalFilename}`}
            >
              <HiPencil className="h-4 w-4" />
            </button>
          )} */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex-shrink-0 rounded-full bg-light-200 p-1.5 text-red-500 transition-colors hover:bg-red-100 focus:outline-none dark:bg-red-900/20 dark:hover:bg-red-900/40"
              aria-label={`Delete ${attachment.fileName}`}
            >
              <HiOutlineTrash className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
