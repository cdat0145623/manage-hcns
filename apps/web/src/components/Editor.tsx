"use client";

import type { Range as TiptapRange } from "@tiptap/core";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
} from "@tiptap/suggestion";
import type { Instance as TippyInstance } from "tippy.js";
import { Button, Menu, Popover, Transition } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import BubbleMenuExtension from "@tiptap/extension-bubble-menu";
import CharacterCount from "@tiptap/extension-character-count";
import Color from "@tiptap/extension-color";
import FloatingMenuExtension from "@tiptap/extension-floating-menu";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import {
  EditorContent,
  Extension,
  ReactRenderer,
  useEditor,
} from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Suggestion from "@tiptap/suggestion";
import {
  forwardRef,
  Fragment,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  HiBars3,
  HiBars3BottomLeft,
  HiBars3BottomRight,
  HiEllipsisVertical,
  HiOutlineArrowPath,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineBold,
  HiOutlineChatBubbleLeftEllipsis,
  HiOutlineCheckCircle,
  HiOutlineCodeBracket,
  HiOutlineCodeBracketSquare,
  HiOutlineItalic,
  HiOutlineLink,
  HiOutlineListBullet,
  HiOutlineMinus,
  HiOutlineNumberedList,
  HiOutlineStrikethrough,
  HiOutlineUnderline,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";
import tippy from "tippy.js";
import { Markdown } from "tiptap-markdown";

import { getAvatarUrl } from "~/utils/helpers";
import Avatar from "./Avatar";
import { YouTubeNode } from "./YouTubeEmbed/YouTubeNode";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    slashSuggestion: {
      setSlashSuggestion: () => ReturnType;
    };
  }
}

export interface SlashCommandItem {
  title: string;
  icon?: React.ReactNode;
  command?: (props: { editor: TiptapEditor; range: TiptapRange }) => void;
  disabled?: boolean;
}

export interface SlashCommandsOptions {
  suggestion?: Partial<SuggestionOptions>;
  commandItems?: SlashCommandItem[];
  options?: any;
}

function filterSlashCommandItems(items: SlashCommandItem[], query: string) {
  return items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()),
  );
}

export interface RenderSuggestionsProps {
  editor: TiptapEditor;
  clientRect: () => DOMRect;
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface WorkspaceMember {
  publicId: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  email: string;
}

const CommandsList = forwardRef<
  { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
  {
    items: SlashCommandItem[];
    command: (item: SlashCommandItem) => void;
  }
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length);
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((selectedIndex + 1) % items.length);
        return true;
      }

      if (event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }

      return false;
    },
  }));

  return (
    <div className="w-56 rounded-md border-[1px] border-light-200 bg-light-50 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:border-dark-500 dark:bg-dark-200">
      <div className="max-h-[350px] overflow-y-auto p-1">
        {items.map((item, index) => (
          <button
            key={item.title}
            onClick={() => command(item)}
            className={twMerge(
              "group flex w-full items-center rounded-[5px] p-2 hover:bg-light-200 dark:hover:bg-dark-300",
              index === selectedIndex && "bg-light-200 dark:bg-dark-300",
            )}
          >
            <span className="text-dark-700 dark:text-dark-800">
              {item.icon}
            </span>
            <span className="ml-3 text-[12px] font-medium text-dark-900 dark:text-dark-1000">
              {item.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
});

CommandsList.displayName = "CommandsList";

const RenderSuggestions = () => {
  let reactRenderer: ReactRenderer;
  let popup: TippyInstance[];

  return {
    onStart: (props: RenderSuggestionsProps) => {
      reactRenderer = new ReactRenderer(CommandsList, {
        props,
        editor: props.editor,
      });

      if (!props.clientRect) return;

      popup = tippy("body", {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: reactRenderer.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
      });
    },
    onUpdate(props: RenderSuggestionsProps) {
      reactRenderer?.updateProps(props);

      if (!props.clientRect) return;

      popup[0]?.setProps({
        getReferenceClientRect: props.clientRect,
      });
    },
    onKeyDown(props: SuggestionKeyDownProps): boolean {
      if (props.event.key === "Escape") {
        popup[0]?.hide();
        return true;
      }

      return (
        (
          reactRenderer.ref as {
            onKeyDown?: (props: SuggestionKeyDownProps) => boolean;
          }
        ).onKeyDown?.(props) ?? false
      );
    },
    onExit() {
      popup[0]?.destroy();
      reactRenderer.destroy();
    },
  };
};

interface MentionItem {
  id: string;
  label: string;
  image: string | null;
}

const MentionList = forwardRef<
  { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
  {
    items: MentionItem[];
    command: (item: MentionItem) => void;
  }
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length);
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((selectedIndex + 1) % items.length);
        return true;
      }

      if (event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }

      return false;
    },
  }));

  return (
    <div className="w-56 rounded-md border-[1px] border-light-200 bg-light-50 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:border-dark-500 dark:bg-dark-200">
      <div className="max-h-[350px] overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-light-200 dark:scrollbar-thumb-dark-300">
        {items.length > 0 ? (
          items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => command(item)}
              className={twMerge(
                "group flex w-full items-center rounded-[5px] p-2 hover:bg-light-200 dark:hover:bg-dark-300",
                index === selectedIndex && "bg-light-200 dark:bg-dark-300",
              )}
            >
              <Avatar
                size="xs"
                name={item.label}
                imageUrl={item.image ? getAvatarUrl(item.image) : undefined}
                email={item.label}
              />
              <span className="ml-3 text-[12px] font-medium text-dark-900 dark:text-dark-1000">
                {item.label}
              </span>
            </button>
          ))
        ) : (
          <div className="flex items-center justify-start p-2">
            <span className="text-[12px] text-dark-900 dark:text-dark-1000">
              No results
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

MentionList.displayName = "MentionList";

const renderMentionSuggestions = () => {
  let reactRenderer: ReactRenderer;
  let popup: TippyInstance[];

  return {
    onStart: (props: any) => {
      reactRenderer = new ReactRenderer(MentionList, {
        props,
        editor: props.editor,
      });

      if (!props.clientRect) return;

      popup = tippy("body", {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: reactRenderer.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
      });
    },
    onUpdate(props: any) {
      reactRenderer.updateProps(props);
      if (!props.clientRect) return;
      popup[0]?.setProps({ getReferenceClientRect: props.clientRect });
    },
    onKeyDown(props: SuggestionKeyDownProps) {
      if (props.event.key === "Escape") {
        popup[0]?.hide();
        return true;
      }
      return (
        (
          reactRenderer.ref as {
            onKeyDown?: (props: SuggestionKeyDownProps) => boolean;
          }
        ).onKeyDown?.(props) ?? false
      );
    },
    onExit() {
      popup[0]?.destroy();
      reactRenderer.destroy();
    },
  };
};

const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slash-commands",
  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => {
          return filterSlashCommandItems([] as SlashCommandItem[], query);
        },
        render: () => {
          let component: ReturnType<typeof RenderSuggestions>;
          return {
            onStart: (props: any) => {
              component = RenderSuggestions();
              component.onStart(props);
            },
            onUpdate(props: any) {
              component?.onUpdate(props);
            },
            onKeyDown(props: any) {
              if (props.event.key === "Escape") {
                return true;
              }
              return component?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              component?.onExit();
            },
          };
        },
      },
      commandItems: [] as SlashCommandItem[],
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        render: RenderSuggestions,
      } as SuggestionOptions),
    ];
  },
});

export interface SlashNodeAttrs {
  id: string | null;
  label?: string | null;
}

const getCommandItems = (disableHeadings: boolean): SlashCommandItem[] => {
  const headingCommands: SlashCommandItem[] = disableHeadings
    ? []
    : [
        {
          title: "H1",
          icon: <span className="font-bold">H1</span>,
          command: ({ editor }) =>
            editor.chain().focus().setHeading({ level: 1 }).run(),
        },
        {
          title: "H2",
          icon: <span className="font-bold">H2</span>,
          command: ({ editor }) =>
            editor.chain().focus().setHeading({ level: 2 }).run(),
        },
        {
          title: "H3",
          icon: <span className="font-bold">H3</span>,
          command: ({ editor }) =>
            editor.chain().focus().setHeading({ level: 3 }).run(),
        },
      ];

  return [
    ...headingCommands,
    {
      title: "Checklist",
      icon: <HiOutlineCheckCircle />,
      command: ({ editor }) => editor.chain().focus().toggleTaskList().run(),
    },
    {
      title: "Bullet List",
      icon: <HiOutlineListBullet />,
      command: ({ editor }) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      title: "Ordered List",
      icon: <HiOutlineNumberedList />,
      command: ({ editor }) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      title: "Divider",
      icon: <HiOutlineMinus />,
      command: ({ editor }) => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      title: "Blockquote",
      icon: <HiOutlineChatBubbleLeftEllipsis />,
      command: ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      title: "Code Block",
      icon: <HiOutlineCodeBracketSquare />,
      command: ({ editor }) => editor.chain().focus().toggleCodeBlock().run(),
    },
  ];
};

export default function Editor({
  content,
  onChange,
  onBlur,
  readOnly = false,
  workspaceMembers,
  enableYouTubeEmbed = true,
  placeholder,
  disableHeadings = false,
  hideCharacterCount = true,
  size = "md",
  maxHeightClass,
  popoverPlacement = "bottom",
}: {
  content: string | null;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  workspaceMembers: WorkspaceMember[];
  enableYouTubeEmbed?: boolean;
  placeholder?: string;
  disableHeadings?: boolean;
  hideCharacterCount?: boolean;
  size?: "sm" | "md";
  maxHeightClass?: string;
  popoverPlacement?: "top" | "bottom";
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: disableHeadings ? false : undefined,
        }),
        Link.configure({
          openOnClick: true,
          HTMLAttributes: {
            class: "text-blue-600 hover:text-blue-800 underline cursor-pointer",
            target: "_blank",
            rel: "noopener noreferrer",
          },
          validate: (href) => /^https?:\/\//.test(href),
          autolink: true,
          linkOnPaste: true,
        }),
        Markdown,
        Placeholder.configure({
          placeholder: readOnly ? "" : (placeholder ?? t`Thêm mô tả...`),
        }),
        SlashCommands.configure({
          commandItems: getCommandItems(disableHeadings),
          suggestion: {
            items: ({ query }: { query: string }) =>
              filterSlashCommandItems(getCommandItems(disableHeadings), query),
            startOfLine: true,
            char: "/",
          },
        }),
        Mention.configure({
          HTMLAttributes: {
            class: "mention",
          },
          suggestion: {
            char: "@",
            items: ({ query }: { query: string }) => {
              const withEmail = workspaceMembers.filter(
                (member) => member.email,
              );

              const mapped = withEmail.map((member: WorkspaceMember) => ({
                id: member.publicId,
                label: member?.user?.name?.trim() || member.email || "",
                image: member?.user?.image ?? null,
              }));

              const all: MentionItem[] = mapped.filter(
                (item) => item.label && item.label.length > 0,
              );

              const q = query.toLowerCase().trim();

              if (q === "") {
                return all;
              }

              const filtered = all.filter((u) =>
                u.label.toLowerCase().includes(q),
              );
              return filtered;
            },
            command: ({ editor, range, props }) => {
              const id = props.id ?? "";
              const label = props.label ?? "";
              const mentionHTML = `<span data-type="mention" data-id="${id}" data-label="${label}">@${label}</span>&nbsp;`;

              editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertContent(mentionHTML)
                .focus()
                .run();
            },
            render: renderMentionSuggestions,
          },
          renderText({ options, node }) {
            return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`;
          },
        }),
        Typography.configure({
          openDoubleQuote: false,
          closeDoubleQuote: false,
          openSingleQuote: false,
          closeSingleQuote: false,
          oneHalf: false,
          oneQuarter: false,
          threeQuarters: false,
          superscriptTwo: false,
          superscriptThree: false,
        }),
        Underline,
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        CharacterCount,
        BubbleMenuExtension,
        FloatingMenuExtension,
        ...(enableYouTubeEmbed ? [YouTubeNode] : []),
      ],
      content,
      onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
      onBlur: ({ event }) => {
        if (
          document
            .querySelector(".tippy-box")
            ?.contains(event.relatedTarget as Node)
        )
          return;
        // Only trigger onBlur if the click was outside both the editor and menu
        if (!containerRef.current?.contains(event.relatedTarget as Node)) {
          onBlur?.();
        }
      },
      editorProps: {
        attributes: {
          class: twMerge(
            "outline-none focus:outline-none focus-visible:ring-0",
            readOnly
              ? "p-0 min-h-0"
              : size === "sm"
                ? "px-2.5 py-1.5 min-h-[36px]"
                : "px-4 py-3 min-h-[100px]",
          ),
        },
      },
      editable: !readOnly,
      injectCSS: false,
      immediatelyRender: false,
    },
    [], // creating the editor only once
  );

  // this will sync external content changes without re-creating the editor instance
  useEffect(() => {
    if (!editor) return;
    const currentHTML = editor.getHTML();
    const safeContent = content ?? "";
    if (safeContent !== currentHTML) {
      editor.commands.setContent(safeContent, { emitUpdate: false });
    }
  }, [content, editor]);

  return (
    <div
      ref={containerRef}
      className={twMerge("relative group flex flex-col transition-all")}
    >
      <style jsx global>{`
        .tiptap p.is-empty::before {
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .tiptap p {
          margin: 0 0 1rem 0 !important;
        }
        .tiptap .mention {
          background-color: rgba(59, 130, 246, 0.1);
          border-radius: 0.25rem;
          padding: 0.125rem 0.25rem;
          color: rgb(59, 130, 246);
          text-decoration: none;
          font-weight: 500;
        }
        .tiptap [data-youtube] {
          margin: 1rem 0;
        }
        ul[data-type="taskList"] {
          list-style: none;
          padding: 0;
        }
        ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          margin-bottom: 0.5rem;
        }
        ul[data-type="taskList"] li > label {
          flex: 0 0 auto;
          user-select: none;
          margin-right: 0.75rem;
          margin-top: 0.25rem;
        }
        ul[data-type="taskList"] li > div {
          flex: 1 1 auto;
        }
        ul[data-type="taskList"] input[type="checkbox"] {
          cursor: pointer;
          width: 1rem;
          height: 1rem;
          accent-color: rgb(59, 130, 246);
        }
      `}</style>

      {!readOnly && editor && (
        <div className="sticky top-0 z-40 rounded-t-xl bg-white/80 backdrop-blur-md dark:bg-dark-100/80">
          <EditorProToolbar 
            editor={editor} 
            disableHeadings={disableHeadings} 
            popoverPlacement={popoverPlacement}
          />
        </div>
      )}

      <div className={twMerge("overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-light-300 dark:scrollbar-thumb-dark-700", maxHeightClass || "max-h-[250px]")}>
        <EditorContent
          editor={editor}
          className={twMerge(
            "prose dark:prose-invert prose-sm max-w-none [&_blockquote]:border-l-4 [&_blockquote]:border-light-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-light-600 [&_h1]:!text-lg [&_h2]:!text-base [&_h3]:!text-sm [&_ol]:!text-xs [&_p.is-empty::before]:text-light-900 [&_p.is-empty::before]:dark:text-dark-800 [&_p]:!text-sm [&_p]:text-light-950 [&_p]:dark:text-dark-950 [&_ul]:!text-xs",
            size === "sm" && "[&_p]:!text-xs",
          )}
        />
      </div>

      {!readOnly && editor && !hideCharacterCount && (
        <div className="flex items-center justify-end border-t border-light-100 bg-light-50/30 px-3 py-1 text-[10px] font-medium text-light-500 dark:border-dark-300 dark:text-dark-600">
          {editor.storage.characterCount.characters()} {t`ký tự`}
        </div>
      )}
    </div>
  );
}

function ColorPicker({
  editor,
  title,
  icon,
  type,
  popoverPlacement = "bottom",
}: {
  editor: TiptapEditor;
  title: string;
  icon: React.ReactNode;
  type: "text" | "highlight";
  popoverPlacement?: "top" | "bottom";
}) {
  const colors = [
    "#000000",
    "#4B5563",
    "#EF4444",
    "#F59E0B",
    "#10B981",
    "#3B82F6",
    "#6366F1",
    "#8B5CF6",
    "#EC4899",
    "#FFFFFF",
    "#D1D5DB",
    "#FCA5A5",
    "#FCD34D",
    "#6EE7B7",
    "#93C5FD",
    "#A5B4FC",
    "#C4B5FD",
    "#FBCFE8",
  ];

  return (
    <Popover className="relative">
      <Popover.Button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-light-500 transition-all hover:bg-light-100 hover:text-light-1000 dark:text-dark-600 dark:hover:bg-dark-300 dark:hover:text-dark-1000"
      >
        <div className="flex flex-col items-center">
          {icon}
          <div
            className="mt-0.5 h-0.5 w-3 rounded-full"
            style={{
              backgroundColor:
                type === "text"
                  ? editor.getAttributes("textStyle").color || "currentColor"
                  : editor.getAttributes("highlight").color || "transparent",
            }}
          />
        </div>
      </Popover.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Popover.Panel 
          anchor={popoverPlacement === "top" ? "top start" : "bottom start"}
          className="z-[100] w-44 rounded-xl border border-light-200 bg-white p-2 shadow-xl focus:outline-none dark:border-dark-300 dark:bg-dark-100"
        >
          <div className="grid grid-cols-6 gap-1">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  if (type === "text") {
                    editor.chain().focus().setColor(color).run();
                  } else {
                    editor.chain().focus().setHighlight({ color }).run();
                  }
                }}
                className="h-5 w-5 rounded-md border border-light-200 dark:border-dark-400"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                if (type === "text") {
                  editor.chain().focus().unsetColor().run();
                } else {
                  editor.chain().focus().unsetHighlight().run();
                }
              }}
              className="col-span-6 mt-1 flex items-center justify-center rounded-md py-1 text-[10px] font-bold uppercase tracking-wider text-light-500 hover:bg-light-50 dark:hover:bg-dark-200"
            >
              {t`Xóa màu`}
            </button>
          </div>
        </Popover.Panel>
      </Transition>
    </Popover>
  );
}

function ToolbarButton({
  onClick,
  active,
  icon,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  icon: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={twMerge(
        "flex h-7 w-7 items-center justify-center rounded-lg transition-all active:scale-95",
        active
          ? "bg-light-200 text-light-1000 shadow-sm dark:bg-dark-300 dark:text-dark-1000"
          : "text-light-500 hover:bg-light-100 hover:text-light-1000 dark:text-dark-600 dark:hover:bg-dark-200 dark:hover:text-dark-1000",
      )}
    >
      {icon}
    </button>
  );
}

interface ToolbarProps {
  editor: TiptapEditor;
  disableHeadings: boolean;
  popoverPlacement?: "top" | "bottom";
}

function EditorProToolbar({
  editor,
  disableHeadings,
  popoverPlacement = "bottom",
}: ToolbarProps) {
  const extraItems = getCommandItems(disableHeadings);

  return (
    <div className="flex flex-nowrap items-center gap-1 rounded-t-[10px] border-b border-light-100/80 bg-light-50/50 p-1.5 px-2.5 backdrop-blur-sm dark:border-dark-300/80 dark:bg-dark-100/50">
      <div className="mx-0.5 h-4 w-px shrink-0 bg-light-200 dark:bg-dark-300" />

      <div className="flex shrink-0 items-center gap-0.5 pr-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          active={false}
          icon={<HiOutlineArrowUturnLeft className="h-4 w-4" />}
          title={t`Hoàn tác`}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          active={false}
          icon={<HiOutlineArrowUturnRight className="h-4 w-4" />}
          title={t`Làm lại`}
        />
      </div>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-light-200 dark:bg-dark-300" />

      <div className="flex shrink-0 items-center gap-0.5 pr-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          icon={<HiOutlineBold className="h-4 w-4" />}
          title={t`Đậm`}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          icon={<HiOutlineItalic className="h-4 w-4" />}
          title={t`Nghiêng`}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          icon={<HiOutlineUnderline className="h-4 w-4" />}
          title={t`Gạch chân`}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          icon={<HiOutlineStrikethrough className="h-4 w-4" />}
          title={t`Gạch ngang`}
        />
      </div>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-light-200 dark:bg-dark-300" />

      <div className="flex shrink-0 items-center gap-0.5 px-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          icon={<HiBars3BottomLeft className="h-4 w-4" />}
          title={t`Căn trái`}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          icon={<HiBars3 className="h-4 w-4" />}
          title={t`Căn giữa`}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          icon={<HiBars3BottomRight className="h-4 w-4" />}
          title={t`Căn phải`}
        />
      </div>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-light-200 dark:bg-dark-300" />

      <div className="flex shrink-0 items-center gap-0.5 px-1">
        <ColorPicker
          editor={editor}
          title={t`Màu chữ`}
          type="text"
          popoverPlacement={popoverPlacement}
          icon={
            <span className="mt-0.5 font-serif text-xs font-bold leading-none">
              A
            </span>
          }
        />
        <ColorPicker
          editor={editor}
          title={t`Màu nền`}
          type="highlight"
          popoverPlacement={popoverPlacement}
          icon={
            <div className="flex h-3 w-3 items-center justify-center rounded-sm border border-light-400 dark:border-dark-500">
              <div className="h-1.5 w-1.5 bg-yellow-400" />
            </div>
          }
        />
      </div>

      <div className="min-w-1 flex-1 shrink-0" />

      <Menu as="div" className="relative inline-block shrink-0 text-left">
        <Menu.Button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-light-500 transition-all hover:bg-light-100 hover:text-light-1000 dark:text-dark-600 dark:hover:bg-dark-300 dark:hover:text-dark-1000"
        >
          <HiEllipsisVertical className="h-4 w-4" />
        </Menu.Button>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items 
            anchor={popoverPlacement === "top" ? "top end" : "bottom end"}
            className="z-[100] w-48 rounded-xl border border-light-200 bg-white p-1.5 shadow-xl ring-1 ring-light-100/50 focus:outline-none dark:border-dark-300 dark:bg-dark-100 dark:ring-white/5"
          >
            <div className="max-h-[350px] space-y-0.5 overflow-y-auto p-0.5 scrollbar-thin scrollbar-thumb-light-200 dark:scrollbar-thumb-dark-300">
              {!disableHeadings && (
                <>
                  {[1, 2, 3].map((level) => (
                    <Menu.Item key={level}>
                      {({ active }) => (
                        <button
                          type="button"
                          onClick={() =>
                            editor
                              .chain()
                              .focus()
                              .toggleHeading({ level: level as any })
                              .run()
                          }
                          className={twMerge(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                            active || editor.isActive("heading", { level })
                              ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                              : "text-light-600",
                          )}
                        >
                          <span className="flex h-4 w-4 items-center justify-center text-[10px] font-bold">
                            H{level}
                          </span>
                          Tiêu đề {level}
                        </button>
                      )}
                    </Menu.Item>
                  ))}
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        type="button"
                        onClick={() =>
                          editor.chain().focus().setParagraph().run()
                        }
                        className={twMerge(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                          active || editor.isActive("paragraph")
                            ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                            : "text-light-600",
                        )}
                      >
                        <span className="flex h-4 w-4 items-center justify-center text-[10px] font-bold">
                          ¶
                        </span>
                        {t`Văn bản`}
                      </button>
                    )}
                  </Menu.Item>
                  <div className="my-1 h-px bg-light-100 dark:bg-dark-200" />
                </>
              )}
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() =>
                      editor.chain().focus().toggleBulletList().run()
                    }
                    className={twMerge(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                      active || editor.isActive("bulletList")
                        ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                        : "text-light-600",
                    )}
                  >
                    <HiOutlineListBullet className="h-4 w-4" />
                    {t`Danh sách ký hiệu`}
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() =>
                      editor.chain().focus().toggleOrderedList().run()
                    }
                    className={twMerge(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                      active || editor.isActive("orderedList")
                        ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                        : "text-light-600",
                    )}
                  >
                    <HiOutlineNumberedList className="h-4 w-4" />
                    {t`Danh sách số`}
                  </button>
                )}
              </Menu.Item>
              <div className="my-1 h-px bg-light-100 dark:bg-dark-200" />
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() =>
                      editor.chain().focus().toggleBlockquote().run()
                    }
                    className={twMerge(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                      active || editor.isActive("blockquote")
                        ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                        : "text-light-600",
                    )}
                  >
                    <HiOutlineChatBubbleLeftEllipsis className="h-4 w-4" />
                    {t`Trích dẫn`}
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() =>
                      editor.chain().focus().toggleCodeBlock().run()
                    }
                    className={twMerge(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                      active || editor.isActive("codeBlock")
                        ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                        : "text-light-600",
                    )}
                  >
                    <HiOutlineCodeBracketSquare className="h-4 w-4" />
                    {t`Đoạn mã`}
                  </button>
                )}
              </Menu.Item>
              <div className="my-1 h-px bg-light-100 dark:bg-dark-200" />
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={() =>
                      editor.chain().focus().setHorizontalRule().run()
                    }
                    className={twMerge(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                      active
                        ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                        : "text-light-600",
                    )}
                  >
                    <HiOutlineMinus className="h-4 w-4" />
                    {t`Đường kẻ ngang`}
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={() =>
                      editor.chain().focus().toggleTaskList().run()
                    }
                    className={twMerge(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                      active || editor.isActive("taskList")
                        ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                        : "text-light-600",
                    )}
                  >
                    <HiOutlineCheckCircle className="h-4 w-4" />
                    {t`Checklist`}
                  </button>
                )}
              </Menu.Item>
              <div className="my-1 h-px bg-light-100 dark:bg-dark-200" />
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={() => {
                      const url = window.prompt("URL:");
                      if (url)
                        editor.chain().focus().setLink({ href: url }).run();
                    }}
                    className={twMerge(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                      active
                        ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                        : "text-light-600",
                    )}
                  >
                    <HiOutlineLink className="h-4 w-4" />
                    {t`Liên kết`}
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().unsetLink().run()}
                    disabled={!editor.isActive("link")}
                    className={twMerge(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                      active
                        ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                        : "text-light-600",
                      !editor.isActive("link") && "opacity-30",
                    )}
                  >
                    <HiOutlineLink className="h-4 w-4" />
                    {t`Bỏ liên kết`}
                  </button>
                )}
              </Menu.Item>
              <div className="my-1 h-px bg-light-100 dark:bg-dark-200" />
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().clearNodes().run()}
                    className={twMerge(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                      active
                        ? "bg-light-100 text-light-1000 dark:bg-dark-200"
                        : "text-light-600",
                    )}
                  >
                    <HiOutlineCodeBracket className="h-4 w-4" />
                    {t`Xóa định dạng`}
                  </button>
                )}
              </Menu.Item>
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
    </div>
  );
}

function EditorBubbleMenu({ editor }: { editor: TiptapEditor | null }) {
  const isMac = navigator.platform.includes("Mac");

  const bubbleMenuItems = [
    {
      title: "Bold",
      icon: <HiOutlineBold />,
      keys: ["meta", "b"],
      onClick: () => editor?.chain().focus().toggleBold().run(),
      active: editor?.isActive("bold"),
    },
    {
      title: "Italic",
      icon: <HiOutlineItalic />,
      keys: ["meta", "i"],
      onClick: () => editor?.chain().focus().toggleItalic().run(),
      active: editor?.isActive("italic"),
    },
    {
      title: "Strikethrough",
      icon: <HiOutlineStrikethrough />,
      keys: ["meta", "shift", "s"],
      onClick: () => editor?.chain().focus().toggleStrike().run(),
      active: editor?.isActive("strike"),
    },
    {
      title: "Code",
      icon: <HiOutlineCodeBracket />,
      keys: ["meta", "e"],
      onClick: () => editor?.chain().focus().toggleCode().run(),
      active: editor?.isActive("code"),
    },
  ];
  return (
    <BubbleMenu editor={editor ?? undefined}>
      <div className="flex items-center gap-2 rounded-md border border-light-600 bg-light-50 p-1 dark:border-dark-600 dark:bg-dark-50">
        {bubbleMenuItems.map((item) => (
          <Button
            key={item.title}
            type="button"
            className={twMerge(
              "rounded p-1 text-light-900 focus:ring-2 focus:ring-light-600 dark:text-dark-900 dark:focus:ring-dark-600",
              item.active && "bg-light-100 dark:bg-dark-400",
            )}
            title={`${item.title} [${item.keys.join(" + ").replace("meta", isMac ? "⌘" : "ctrl")}]`}
            onClick={item.onClick}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                item.onClick();
              }
            }}
          >
            {item.icon}
          </Button>
        ))}
      </div>
    </BubbleMenu>
  );
}
