import { t } from "@lingui/core/macro";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { HiXMark } from "react-icons/hi2";

import { generateUID } from "@kan/shared/utils";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import {
  invalidateCard,
  invalidateTaskInstance,
} from "~/utils/cardInvalidation";

interface NewChecklistFormInput {
  name: string;
  cardPublicId?: string;
  taskInstanceId?: string;
}

export function NewChecklistForm({
  cardPublicId,
  taskInstanceId,
  hideHeader,
  onSuccess,
}: {
  cardPublicId?: string;
  taskInstanceId?: string;
  hideHeader?: boolean;
  onSuccess?: () => void;
}) {
  const { closeModal, setModalState } = useModal();
  const { showPopup } = usePopup();

  const utils = api.useUtils();

  const { register, handleSubmit, reset, watch } =
    useForm<NewChecklistFormInput>({
      defaultValues: {
        name: "Checklist",
        cardPublicId,
        taskInstanceId,
      },
    });

  const createChecklist = api.checklist.create.useMutation({
    onMutate: async (args) => {
      let previousCard = undefined;
      let previousTaskInstance = undefined;
      if (args.cardPublicId) {
        await utils.card.byId.cancel({ cardPublicId: args.cardPublicId });
        previousCard = utils.card.byId.getData({
          cardPublicId: args.cardPublicId,
        });
        utils.card.byId.setData({ cardPublicId: args.cardPublicId }, (old) => {
          if (!old) return old as any;
          const placeholderChecklist = {
            publicId: `PLACEHOLDER_${generateUID()}`,
            name: args.name,
            index: old.checklists.length,
            items: [] as {
              publicId: string;
              title: string;
              completed: boolean;
              index: number;
            }[],
          };
          return {
            ...old,
            checklists: [...old.checklists, placeholderChecklist],
          } as typeof old;
        });
      }
      if (args.taskInstanceId) {
        await utils.taskInstance.byId.cancel({ id: args.taskInstanceId });
        previousTaskInstance = utils.taskInstance.byId.getData({
          id: args.taskInstanceId,
        });
        utils.taskInstance.byId.setData({ id: args.taskInstanceId }, (old) => {
          if (!old) return old as any;
          const placeholderChecklist = {
            publicId: `PLACEHOLDER_${generateUID()}`,
            name: args.name,
            index: old.checklists.length,
            items: [] as {
              publicId: string;
              title: string;
              completed: boolean;
              index: number;
            }[],
          };
          return {
            ...old,
            checklists: [...old.checklists, placeholderChecklist],
          } as typeof old;
        });
      }
      return { previousCard, previousTaskInstance };
    },
    onSuccess: (data) => {
      setModalState("ADD_CHECKLIST", { createdChecklistId: data.publicId });
      setTimeout(() => closeModal(), 0);
    },
    onError: (_error, vars, ctx) => {
      if (ctx?.previousCard) {
        if (vars.cardPublicId) {
          utils.card.byId.setData(
            { cardPublicId: vars.cardPublicId },
            ctx.previousCard,
          );
        }
      }
      if (ctx?.previousTaskInstance) {
        if (vars.taskInstanceId) {
          utils.taskInstance.byId.setData(
            { id: vars.taskInstanceId },
            ctx.previousTaskInstance,
          );
        }
      }
      showPopup({
        header: t`Unable to create checklist`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async (_data, _error, vars) => {
      if (vars.cardPublicId) {
        await invalidateCard(utils, vars.cardPublicId);
      }
      if (vars.taskInstanceId) {
        await invalidateTaskInstance(utils, vars.taskInstanceId);
      }
      onSuccess?.();
    },
  });

  useEffect(() => {
    const nameElement: HTMLElement | null =
      document.querySelector<HTMLElement>("#checklist-name");
    if (nameElement) nameElement.focus();
  }, []);

  const onSubmit = (data: NewChecklistFormInput) => {
    reset({
      name: "",
    });

    createChecklist.mutate({
      name: data.name,
      cardPublicId: data.cardPublicId,
      taskInstanceId: data.taskInstanceId,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="px-5 pt-5">
        {!hideHeader && (
          <div className="flex w-full items-center justify-between pb-4">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
              {t`Thêm Checklist`}
            </h2>
            <button
              type="button"
              className="rounded p-1 hover:bg-light-200 focus:outline-none dark:hover:bg-dark-300"
              onClick={(e) => {
                e.preventDefault();
                closeModal();
              }}
            >
              <HiXMark
                size={18}
                className="text-light-900 dark:text-dark-900"
              />
            </button>
          </div>
        )}

        <Input
          id="checklist-name"
          placeholder={t`Checklist name`}
          {...register("name")}
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              await handleSubmit(onSubmit)();
            }
          }}
        />
      </div>
      <div className="mt-12 flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        <div>
          <Button
            type="submit"
            disabled={createChecklist.isPending || !watch("name")}
          >
            {t`Tạo checklist`}
          </Button>
        </div>
      </div>
    </form>
  );
}
