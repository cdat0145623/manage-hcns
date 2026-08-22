import { t } from "@lingui/core/macro";
import { useForm } from "react-hook-form";
import { HiOutlineArrowUp } from "react-icons/hi2";

import type { WorkspaceMember } from "~/components/Editor";
import Editor from "~/components/Editor";
import LoadingSpinner from "~/components/LoadingSpinner";
import { usePermissions } from "~/hooks/usePermissions";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import {
  invalidateCard,
  invalidateTaskInstance,
} from "~/utils/cardInvalidation";

interface FormValues {
  comment: string;
}

const NewCommentForm = ({
  cardPublicId,
  taskInstanceId,
  workspaceMembers,
  onSuccess,
}: {
  cardPublicId?: string;
  taskInstanceId?: string;
  workspaceMembers: WorkspaceMember[];
  onSuccess?: () => void | Promise<void>;
}) => {
  const utils = api.useUtils();
  const { showPopup } = usePopup();
  const { handleSubmit, setValue, watch, reset } = useForm<FormValues>({
    values: {
      comment: "",
    },
  });

  const addCardCommentMutation = api.card.addComment.useMutation({
    onError: () => {
      showPopup({
        header: t`Unable to add comment`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      reset();
      if (cardPublicId) await invalidateCard(utils, cardPublicId);
      await onSuccess?.();
    },
  });

  const addTaskCommentMutation = api.taskInstance.addComment.useMutation({
    onError: () => {
      showPopup({
        header: t`Unable to add comment`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      reset();
      if (taskInstanceId) await invalidateTaskInstance(utils, taskInstanceId);
    },
  });

  const isPending =
    addCardCommentMutation.isPending || addTaskCommentMutation.isPending;

  const onSubmit = (data: FormValues) => {
    if (cardPublicId) {
      addCardCommentMutation.mutate({
        cardPublicId,
        comment: data.comment,
      });
    } else if (taskInstanceId) {
      addTaskCommentMutation.mutate({
        id: taskInstanceId,
        comment: data.comment,
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="group relative flex w-full max-w-[800px] flex-col rounded-xl border border-light-200 bg-white shadow-sm transition-all focus-within:border-light-400 focus-within:shadow-md dark:border-dark-300 dark:bg-dark-100 dark:focus-within:border-dark-500"
    >
      <div className="flex-1">
        <Editor
          content={watch("comment")}
          onChange={(value) => setValue("comment", value)}
          workspaceMembers={workspaceMembers}
          enableYouTubeEmbed={false}
          placeholder={t`Bình luận...`}
          disableHeadings={true}
          popoverPlacement="top"
        />
      </div>
      <div className="absolute bottom-3 right-3 z-30">
        <button
          type="submit"
          disabled={
            isPending || !watch("comment") || watch("comment") === "<p></p>"
          }
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-light-950 text-white shadow-sm transition-all hover:scale-110 hover:bg-light-1000 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 dark:bg-dark-950"
        >
          {isPending ? (
            <LoadingSpinner size="sm" />
          ) : (
            <HiOutlineArrowUp strokeWidth={3} className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </form>
  );
};

export default NewCommentForm;
