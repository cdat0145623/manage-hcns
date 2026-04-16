import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { useState, Fragment, useEffect } from "react";
import {
  HiArrowDownTray,
  HiChevronDown,
  HiOutlinePlusSmall,
  HiChevronUpDown,
  HiCheck,
  HiOutlineUserCircle,
} from "react-icons/hi2";

import Button from "~/components/Button";
import FeedbackModal from "~/components/FeedbackModal";
import Modal from "~/components/modal";
import { NewWorkspaceForm } from "~/components/NewWorkspaceForm";
import { PageHead } from "~/components/PageHead";
import { Tooltip } from "~/components/Tooltip";
import { usePermissions } from "~/hooks/usePermissions";
import { useKeyboardShortcut } from "~/providers/keyboard-shortcuts";
import { useModal } from "~/providers/modal";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { BoardsList } from "./components/BoardsList";
import { ImportBoardsForm } from "./components/ImportBoardsForm";
import { NewBoardForm } from "./components/NewBoardForm";

const boardsTabs = [
  { key: "boards" as const, label: t`Active` },
  { key: "archived" as const, label: t`Archived` },
];

export default function BoardsPage({ isTemplate }: { isTemplate?: boolean }) {
  const { openModal, modalContentType, isOpen } = useModal();
  const { workspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<"boards" | "archived">("boards");
  const { canCreateBoard } = usePermissions();

  const isAdmin = workspace.role === "ADMIN";

  const { data: users } = api.user.getAll.useQuery();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(users?.[0]?.id ?? null);

  useEffect(() => {
    if (users?.[0]?.id && selectedUserId === null) {
      setSelectedUserId(users[0].id);
    }
  }, [users]);

  const { tooltipContent: createModalShortcutTooltipContent } =
    useKeyboardShortcut({
      type: "PRESS",
      stroke: { key: "C" },
      action: () => canCreateBoard && openModal("NEW_BOARD"),
      description: t`Tạo ${isTemplate ? "mẫu mới" : "bảng mới"}`,
      group: "ACTIONS",
    });

  return (
    <>
      <PageHead
        title={t`${isTemplate ? "Templates" : "Boards"} | ${workspace.name}`}
      />
      <div className="m-auto h-full max-w-[1100px] p-8 px-5 md:px-28 md:py-12">
        <div className="relative z-10 mb-8 flex w-full items-center justify-between">
          <h1 className="font-bold tracking-tight text-neutral-900 dark:text-dark-1000 sm:text-[1.2rem]">
            {t`${isTemplate ? "Templates" : "Boards"}`}
          </h1>
          <div className="flex gap-2">
            {/* {!isTemplate && (
              <Tooltip
                content={
                  !canCreateBoard ? t`You don't have permission` : undefined
                }
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (canCreateBoard) openModal("IMPORT_BOARDS");
                  }}
                  disabled={!canCreateBoard}
                  iconLeft={
                    <HiArrowDownTray aria-hidden="true" className="h-4 w-4" />
                  }
                >
                  {t`Import`}
                </Button>
              </Tooltip>
            )} */}
            {isAdmin && activeTab === "boards" && (
              <div className="relative min-w-[200px]">
                <Listbox value={selectedUserId} onChange={setSelectedUserId}>
                  <div className="relative">
                    {/* <Listbox value={selectedUserId} onChange={setSelectedUserId}> */}
                    <ListboxButton className="relative w-full cursor-pointer rounded-xl border border-neutral-200/70 bg-white/50 py-2.5 pl-4 pr-10 text-left text-sm font-semibold text-neutral-900 shadow-sm transition-all hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-dark-400/50 dark:bg-dark-300/50 dark:text-white dark:hover:bg-dark-200">
                      <span className="flex items-center gap-2.5 truncate">
                        <HiOutlineUserCircle className="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
                        <span className="block truncate">
                          {users?.find((u) => u.id === selectedUserId)?.name || "Chọn người dùng"}
                        </span>
                      </span>
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <HiChevronUpDown className="h-5 w-5 text-neutral-400" aria-hidden="true" />
                      </span>
                    </ListboxButton>
      
                    <Transition
                      as={Fragment}
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100"
                      leaveTo="opacity-0"
                    >
                      <ListboxOptions
                        anchor="bottom"
                        className="z-50 mt-1.5 max-h-60 min-w-[200px] overflow-auto rounded-xl bg-white py-1.5 text-base shadow-xl ring-1 ring-black/5 focus:outline-none dark:bg-dark-50 sm:text-sm [--anchor-max-height:200px]"
                      >
                        {users?.map((user) => (
                          <ListboxOption
                            key={user.id}
                            value={user.id}
                            className={({ focus, selected }) =>
                              `relative cursor-pointer select-none py-2.5 pl-10 pr-4 transition-colors ${
                                focus ? "bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100" : "text-neutral-900 dark:text-neutral-200"
                              } ${selected ? "font-bold" : "font-medium"}`
                            }
                          >
                            {({ selected }) => (
                              <>
                                <span className={`block truncate ${selected ? "text-blue-600 dark:text-blue-400" : ""}`}>
                                  {user.name || user.username || user.email}
                                </span>
                                {selected ? (
                                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600 dark:text-blue-400">
                                    <HiCheck className="h-5 w-5" aria-hidden="true" />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </ListboxOption>
                        ))}
                      </ListboxOptions>
                    </Transition>
                  </div>
                </Listbox>
              </div>
            )}
            <Tooltip
              content={
                !canCreateBoard
                  ? t`You don't have permission`
                  : createModalShortcutTooltipContent
              }
            >
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  if (canCreateBoard) openModal("NEW_BOARD");
                }}
                disabled={!canCreateBoard}
                iconLeft={
                  <HiOutlinePlusSmall aria-hidden="true" className="h-4 w-4" />
                }
              >
                {t`Tạo mới`}
              </Button>
            </Tooltip>
          </div>
        </div>

        <>
          <Modal
            modalSize="md"
            isVisible={isOpen && modalContentType === "NEW_FEEDBACK"}
          >
            <FeedbackModal />
          </Modal>

          <Modal
            modalSize="sm"
            isVisible={isOpen && modalContentType === "NEW_BOARD"}
          >
            <NewBoardForm isTemplate={!!isTemplate} />
          </Modal>

          <Modal
            modalSize="sm"
            isVisible={isOpen && modalContentType === "IMPORT_BOARDS"}
          >
            <ImportBoardsForm />
          </Modal>

          <Modal
            modalSize="sm"
            isVisible={isOpen && modalContentType === "NEW_WORKSPACE"}
          >
            <NewWorkspaceForm />
          </Modal>
        </>

        {!isTemplate ? (
          <div className="flex h-full w-full flex-col">
            <div className="focus:outline-none">
              <div className="sm:hidden">
                <Listbox
                  value={activeTab}
                  onChange={(tab) => setActiveTab(tab)}
                >
                  <div className="relative mb-4">
                    <ListboxButton className="w-full appearance-none rounded-md border-0 bg-light-50 py-3 pl-3 pr-10 text-left text-sm font-semibold text-light-1000 shadow-sm ring-1 ring-inset ring-light-300 dark:bg-dark-50 dark:text-dark-1000 dark:ring-dark-300 dark:focus:ring-dark-500">
                      {boardsTabs.find((tab) => tab.key === activeTab)?.label ??
                        "Select a tab"}
                      <HiChevronDown
                        aria-hidden="true"
                        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-light-900 dark:text-dark-900"
                      />
                    </ListboxButton>
                    <ListboxOptions className="absolute z-10 mt-1 w-full rounded-md bg-light-50 py-1 text-sm shadow-lg ring-1 ring-inset ring-light-300 dark:bg-dark-50 dark:ring-dark-300">
                      {boardsTabs.map((tab) => (
                        <ListboxOption
                          key={tab.key}
                          value={tab.key}
                          className={({ selected }) =>
                            `relative cursor-pointer select-none py-2 pl-3 pr-9 ${
                              selected
                                ? "font-bold text-light-1000 dark:text-dark-1000"
                                : "font-normal text-light-1000 dark:text-dark-1000"
                            }`
                          }
                        >
                          {tab.label}
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                  </div>
                </Listbox>
              </div>
              <div className="hidden sm:block">
                <div>
                  <nav
                    aria-label="Tabs"
                    className="-mb-px flex space-x-8 focus:outline-none"
                  >
                    {boardsTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`mb-8 mt-2 whitespace-nowrap px-1 py-0 text-sm font-semibold transition-colors focus:outline-none ${
                          activeTab === tab.key
                            ? "border-light-1000 text-light-1000 dark:border-dark-1000 dark:text-dark-1000"
                            : "border-transparent text-light-900 hover:border-light-950 hover:text-light-950 dark:text-dark-900 dark:hover:border-white/20 dark:hover:text-dark-950"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>
              </div>
            </div>
            <div className="flex h-full flex-row focus:outline-none">
              {activeTab === "boards" && (
                <BoardsList isTemplate={false} archived={false} userId={selectedUserId ?? undefined} />
              )}
              {activeTab === "archived" && (
                <BoardsList isTemplate={false} archived={true} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-row">
            <BoardsList isTemplate={!!isTemplate} userId={undefined}/>
          </div>
        )}
      </div>
    </>
  );
}
