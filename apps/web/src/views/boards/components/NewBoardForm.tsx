import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { useEffect, useState, Fragment } from "react";
import { useForm } from "react-hook-form";
import { HiXMark, HiChevronDown } from "react-icons/hi2";
import { z } from "zod";

import type { Template } from "./TemplateBoards";
import Button from "~/components/Button";
import Input from "~/components/Input";
import Toggle from "~/components/Toggle";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import TemplateBoards from "./TemplateBoards";
import { Listbox, Transition } from "@headlessui/react";
import { twMerge } from "tailwind-merge";

const schema = z.object({
  name: z
    .string()
    .min(1, { message: t`Board name is required` })
    .max(100, { message: t`Board name cannot exceed 100 characters` }),
  workspacePublicId: z.string(),
  template: z.custom<Template | null>(),
});

interface NewBoardInputWithTemplate {
  name: string;
  workspacePublicId: string;
  template: Template | null;
}

export const getTemplates = (): Template[] => [
  {
    id: "basic",
    name: t`Basic template`,
    lists: [t`To Do`, t`In Progress`, t`Done`],
    labels: [t`High Priority`, t`Medium Priority`, t`Low Priority`],
  }
];

export const listNames = [
  {
    name:"Tháng 1",
    id:1
  },
  {
    name:"Tháng 2",
    id:2
  },
  {
    name:"Tháng 3",
    id:3
  },
  {
    name:"Tháng 4",
    id:4
  },
  {
    name:"Tháng 5",
    id:5
  },
  {
    name:"Tháng 6",
    id:6
  },
  {
    name:"Tháng 7",
    id:7
  },
  {
    name:"Tháng 8",
    id:8
  },
  {
    name:"Tháng 9",
    id:9
  },
  {
    name:"Tháng 10",
    id:10
  },
  {
    name:"Tháng 11",
    id:11
  },
  {
    name:"Tháng 12",
    id:12
  },
]

export function NewBoardForm({ isTemplate }: { isTemplate?: boolean }) {
  const utils = api.useUtils();
  const { closeModal } = useModal();
  const router = useRouter();
  const { showPopup } = usePopup();
  const { workspace } = useWorkspace();
  const [showTemplates, setShowTemplates] = useState(false);

  const isAdmin = workspace.role === "ADMIN";

  const { data: templates } = api.board.all.useQuery(
    { workspacePublicId: workspace.publicId ?? "", type: "template" },
    { enabled: !!workspace.publicId && isAdmin },
  );

  const formattedTemplates = templates?.map((template) => ({
    id: template.publicId,
    sourceBoardPublicId: template.publicId,
    name: template.name,
    lists: template.lists.map((list) => list.name),
    labels: template.labels.map((label) => label.name),
  }));

  const { data: defaultTemplate } = api.board.getTemplateDefault.useQuery();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<NewBoardInputWithTemplate>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      workspacePublicId: workspace.publicId || "",
      template: null,
    },
  });

  const currentTemplate = watch("template");

  const currentMonth = new Date().getMonth() + 1; // getMonth() trả về 0-11
  const [selectedMonth, setSelectedMonth] = useState(
    listNames.find((m) => m.id === currentMonth) ?? listNames[0]!
  );

  useEffect(() => {
    setValue("name", `${selectedMonth.name}`);
  }, [selectedMonth]);

  const refetchBoards = () => utils.board.all.refetch();

  const createBoard = api.board.create.useMutation({
    onSuccess: async (board) => {
      if (!board) {
        showPopup({
          header: t`Error`,
          message: t`Failed to create board`,
          icon: "error",
        });
      } else {
        router.push(
          `${isTemplate ? "/templates" : "/boards"}/${board.publicId}`,
        );
      }
      closeModal();

      await refetchBoards();
    },
    onError: () => {
      showPopup({
        header: t`Error`,
        message: t`Failed to create board`,
        icon: "error",
      });
    },
  });

  const onSubmit = (data: NewBoardInputWithTemplate) => {
    // if (workspace?.role !== "ADMIN") {
    if (!data.template) {
      if (defaultTemplate) {
        data.template = {
          id: defaultTemplate.publicId,
          sourceBoardPublicId: defaultTemplate.publicId,
          name: defaultTemplate.name,
          lists: defaultTemplate.lists.map((list) => list.name),
          labels: defaultTemplate.labels.map((label) => label.name),
        };
      } else {
        data.template = getTemplates()[0]!;
      }
    }
    // }

    createBoard.mutate({
      name: data.name,
      workspacePublicId: data.workspacePublicId,
      sourceBoardPublicId: data.template?.sourceBoardPublicId ?? undefined,
      lists: data.template?.lists ?? [],
      labels: data.template?.labels ?? [],
      type: isTemplate ? "template" : "regular",
    });
  };

  useEffect(() => {
    const titleElement: HTMLElement | null =
      document.querySelector<HTMLElement>("#name");
    if (titleElement) titleElement.focus();
  }, []);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="px-5 pt-5">
        <div className="text-neutral-9000 flex w-full items-center justify-between pb-4 dark:text-dark-1000">
          <h2 className="text-sm font-bold">{t`New ${isTemplate ? "template" : "board"}`}</h2>
          <button
            type="button"
            className="hover:bg-li ght-300 rounded p-1 focus:outline-none dark:hover:bg-dark-300"
            onClick={(e) => {
              e.preventDefault();
              closeModal();
            }}
          >
            <HiXMark size={18} className="dark:text-dark-9000 text-light-900" />
          </button>
        </div>
        <Listbox
          value={selectedMonth}
          onChange={(option) => {
            setSelectedMonth(option);
            setValue("name", option.name);
          }}
        >
          <div className="relative">
            <Listbox.Button className="relative flex w-full items-center gap-2.5 rounded-xl border border-neutral-200 bg-white py-2.5 pl-3.5 pr-9 text-left text-[13px] text-neutral-900 shadow-sm transition-all hover:border-indigo-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80">
              <span>{selectedMonth.name}</span>  {/* Hiển thị tên tháng hiện tại */}
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
                <HiChevronDown className="h-3.5 w-3.5 text-neutral-400" />
              </span>
            </Listbox.Button>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-200"
              enterFrom="opacity-0 translate-y-1 scale-95"
              enterTo="opacity-100 translate-y-0 scale-100"
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Listbox.Options className="absolute -left-1 z-[100] mt-2 max-h-72 min-w-[180px] overflow-auto rounded-2xl border border-light-200 bg-white p-1 text-sm focus:outline-none dark:border-dark-400 dark:bg-dark-200 sm:left-auto sm:right-0">
                {listNames.map((option, idx) => (
                  <Listbox.Option
                    key={idx}
                    className={({ active }) =>
                      twMerge(
                        "relative cursor-pointer select-none rounded-xl py-2.5 pl-4 pr-4 transition-all",
                        active
                          ? "bg-indigo-600 text-white"
                          : "text-neutral-900 hover:bg-light-100 dark:text-dark-950 dark:hover:bg-dark-300",
                      )
                    }
                    value={option}
                  >
                    <span className="block truncate font-medium">
                      {option.name}
                    </span>
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </div>
        </Listbox>
      </div>
      <TemplateBoards
        currentBoard={currentTemplate}
        setCurrentBoard={(t) => setValue("template", t)}
        showTemplates={showTemplates}
        customTemplates={formattedTemplates ?? []}
      />
      <div className="mt-12 flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        {!isTemplate && isAdmin && (
          <Toggle
            label={t`Use template`}
            isChecked={showTemplates}
            onChange={() => {
              setShowTemplates(!showTemplates);
              if (!showTemplates && !currentTemplate) {
                setValue("template", (templates?.[0] as any) ?? null);
              }
            }}
          />
        )}
        <div>
          <Button type="submit" isLoading={createBoard.isPending}>
            {t`Create ${isTemplate ? "template" : "board"}`}
          </Button>
        </div>
      </div>
    </form>
  );
}
