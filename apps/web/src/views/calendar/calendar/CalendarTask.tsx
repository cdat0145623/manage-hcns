import type { DraggableProvided } from "react-beautiful-dnd";
import { t } from "@lingui/macro";
import { motion } from "framer-motion";
import { Draggable } from "react-beautiful-dnd";

import { formatInAppCalendarZone } from "@kan/shared/utils";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { formatCalendarDeadline } from "~/utils/calendar";
import LoadingSpinner from "~/components/LoadingSpinner";

interface CalendarTaskProps {
  entry: CalendarEntry;
  onClick: (entry: CalendarEntry) => void;
  variant?: "SUMMARY" | "DETAILED";
  index?: number;
  isPositioned?: boolean;
  totalOverlap?: number;
  overlapIndex?: number;
  isDraggable?: boolean;
  /** When true, skip layout projection / shared layoutId (e.g. list inside a modal). */
  disableSharedLayout?: boolean;
  startHour?: number;
  isStacked?: boolean;
}

const STATUS_COLORS: Record<
  "pending" | "done" | "missed",
  {
    bg: string;
    border: string;
    accent: string;
    text: string;
    boxShadow: string;
  }
> = {
  pending: {
    bg: "bg-blue-400 shadow-sm dark:bg-blue-500",
    border: "border-blue-200 dark:border-blue-500/40",
    accent: "bg-blue-700",
    text: "text-blue-900 dark:text-blue-50",
    boxShadow:
      "0 15px 35px -5px rgba(32, 118, 248, 0.24), 0 10px 15px -6px rgba(11, 198, 245, 0.1)",
  },
  done: {
    bg: "bg-green-500 shadow-sm dark:bg-green-600/40",
    border: "border-green-300 dark:border-green-500/50",
    accent: "bg-green-700",
    text: "text-green-900 dark:text-green-50",
    boxShadow:
      "0 15px 35px -5px rgba(79, 204, 21, 0.63), 0 10px 15px -6px rgba(11, 245, 81, 0.1)",
  },
  missed: {
    bg: "bg-red-400 shadow-sm dark:bg-red-600/30",
    border: "border-red-200 dark:border-red-500/40",
    accent: "bg-red-700",
    text: "text-red-900 dark:text-red-50",
    boxShadow:
      "0 15px 35px -5px rgba(245, 27, 11, 0.15), 0 10px 15px -6px rgba(245, 27, 11, 0.1)",
  },
};

const VIRTUAL_COLORS: Record<
  "pending" | "done" | "missed",
  {
    bg: string;
    border: string;
    accent: string;
    text: string;
    boxShadow: string;
  }
> = {
  pending: {
    bg: "bg-blue-100 shadow-sm dark:bg-blue-600/30",
    border: "border-blue-500/50 dark:border-blue-500",
    accent: "bg-blue-500/50",
    text: "text-blue-900/70 dark:text-blue-100/70",
    boxShadow:
      "0 15px 35px -5px rgba(32, 118, 248, 0.24), 0 10px 15px -6px rgba(11, 198, 245, 0.1)",
  },
  done: {
    bg: "bg-green-500/50 dark:bg-green-600/50",
    border: "border-green-200/50 dark:border-green-500/30",
    accent: "bg-green-500/50",
    text: "text-green-900/80 dark:text-green-100/80",
    boxShadow:
      "0 15px 35px -5px rgba(122, 241, 67, 1), 0 10px 15px -6px rgba(11, 245, 81, 0.1)",
  },
  missed: {
    bg: "bg-red-50/70 dark:bg-red-500/10",
    border: "border-red-100/50 dark:border-red-500/20",
    accent: "bg-red-500/50",
    text: "text-red-900/70 dark:text-red-100/70",
    boxShadow:
      "0 15px 35px -5px rgba(245, 27, 11, 0.15), 0 10px 15px -6px rgba(245, 27, 11, 0.1)",
  },
};

export function CalendarTask({
  entry,
  onClick,
  variant = "SUMMARY",
  index = 0,
  isPositioned = false,
  totalOverlap = 1,
  overlapIndex = 0,
  isDraggable = true,
  disableSharedLayout = false,
  startHour = 0,
  isStacked = false,
}: CalendarTaskProps) {
  const isVirtual = entry.type === "VIRTUAL";
  const status = entry.status ?? "pending";
  const colors = isVirtual ? VIRTUAL_COLORS[status] : STATUS_COLORS[status];
  const isExtended =
    !isVirtual &&
    entry.originalEndDate.getTime() !== new Date(entry.endDate).getTime();
  const currentDeadlineLabel = isExtended
    ? formatCalendarDeadline(new Date(entry.endDate), new Date(entry.date))
    : null;

  // Calculate position if needed
  const getPositionStyle = () => {
    if (!isPositioned) return {};

    const hourHeight = 128; // Matching h-32
    const hours = Number(formatInAppCalendarZone(entry.date, "H"));
    const minutes = Number(formatInAppCalendarZone(entry.date, "m"));
    const top = (hours - startHour) * hourHeight + (minutes * hourHeight) / 60;

    // Google Calendar style midnight cutoff
    const spaceUntilMidnight =
      ((24 * 60 - (hours * 60 + minutes)) * hourHeight) / 60;
    const height = Math.min(
      Math.max(((entry.duration || 60) * hourHeight) / 60 - 1, 30), // Min height 20px
      spaceUntilMidnight - 1,
    );

    const maxLanes = Math.min(totalOverlap, 2);
    const widthPercent = 100 / maxLanes;
    const leftPercent = widthPercent * overlapIndex;

    const isHidden = totalOverlap > 2 && overlapIndex >= 2;

    return {
      position: "absolute" as const,
      top: `${top}px`,
      height: `${height}px`,
      left: `${leftPercent}%`,
      width: maxLanes > 1 ? `calc(${widthPercent}% - 4px)` : "100%",
      zIndex: (isVirtual ? 5 : 10) + overlapIndex,
      display: isHidden ? "none" : "flex",
    };
  };

  const renderContent = (provided?: DraggableProvided) => {
    const draggableProps = provided?.draggableProps;
    const dragHandleProps = provided?.dragHandleProps;

    const { onDragStart: _dndDragStart, ...safeDraggableProps } =
      (draggableProps ?? {}) as Record<string, unknown>;
    const { onDragStart: _dndHandleDragStart, ...safeDragHandleProps } =
      (dragHandleProps ?? {}) as Record<string, unknown>;

    return (
      <motion.button
        layout={!disableSharedLayout}
        layoutId={disableSharedLayout ? undefined : entry.id}
        initial={disableSharedLayout ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{
          scale: 1.02,
          y: -2,
          boxShadow: colors.boxShadow,
          zIndex: 40,
          opacity: 1,
        }}
        whileTap={{ scale: 0.98 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 25,
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (entry.isCreating) return;
          onClick(entry);
        }}
        disabled={entry.isCreating}
        aria-busy={entry.isCreating}
        ref={provided?.innerRef}
        {...safeDraggableProps}
        {...safeDragHandleProps}
        className={`${
          variant === "SUMMARY"
            ? `relative ${overlapIndex > 0 ? "ml-0.5" : ""} mb-1 flex h-[10vh] max-h-[50px] min-h-[40px] w-[calc(100%-4px)] items-center overflow-hidden rounded-xl border border-l-[3px] px-2.5 py-1.5 text-[10px] font-black transition-all ${colors.bg} ${colors.border} ${colors.text}`
            : `relative flex w-full flex-col overflow-hidden rounded-2xl border border-l-[6px] px-3 py-2.5 shadow-sm backdrop-blur-md transition-all ${isStacked ? "pointer-events-auto h-14 shrink-0" : ""} ${colors.bg} ${colors.border} ${colors.text}`
        }`}
        style={{
          ...draggableProps?.style,
          ...getPositionStyle(),
          zIndex: isPositioned
            ? (isVirtual ? 5 : 10) + overlapIndex
            : undefined,
          borderLeftColor: entry.color,
        }}
      >
        {/* Accent Bar Fallback */}
        {!entry.color && (
          <div
            className={`absolute bottom-0 left-0 top-0 w-[4px] ${colors.accent} opacity-100 placeholder:pointer-events-none`}
          />
        )}

        {variant === "SUMMARY" ? (
          <div
            className={`pointer-events-none ml-1 flex h-full w-full flex-row items-center justify-start gap-2 overflow-hidden ${colors.text}`}
          >
            {entry.isCreating ? <LoadingSpinner size="sm" /> : null}
            <span className="truncate text-left text-[10px] font-black leading-none">
              {entry.title || "(No title)"}
            </span>
            <span className="shrink-0 text-[10px] font-black opacity-50">
              {formatInAppCalendarZone(entry.date, "H:mm")}
            </span>
            {isExtended && currentDeadlineLabel ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                {t`Đã gia hạn · Hạn mới:`} {currentDeadlineLabel}
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className={`pointer-events-none ml-1 flex h-full flex-col items-start justify-center gap-0.5 overflow-hidden ${colors.text}`}
          >
            <span className="w-full truncate text-left text-xs font-black leading-tight">
              {entry.title || "(No title)"}
            </span>
            <div className="flex w-full items-center gap-1.5 overflow-hidden opacity-60">
              <span className="block whitespace-nowrap text-[10px] font-bold">
                {entry.isCreating ? <LoadingSpinner size="sm" /> : null}
                {formatInAppCalendarZone(entry.date, "H:mm")} -{" "}
                {formatInAppCalendarZone(entry.originalEndDate, "H:mm")}
              </span>
              {isExtended && currentDeadlineLabel ? (
                <span className="whitespace-nowrap text-[10px] font-bold text-amber-800 dark:text-amber-200">
                  {t`Đã gia hạn · Hạn mới:`} {currentDeadlineLabel}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </motion.button>
    );
  };

  if (isVirtual || !isDraggable) {
    return renderContent();
  }

  return (
    <Draggable draggableId={entry.id} index={index}>
      {(provided) => renderContent(provided)}
    </Draggable>
  );
}
