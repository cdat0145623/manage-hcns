import type { DraggableProvided } from "react-beautiful-dnd";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Draggable } from "react-beautiful-dnd";

import type { CalendarEntry } from "~/hooks/useRecurrence";

interface CalendarTaskProps {
  entry: CalendarEntry;
  onClick: (entry: CalendarEntry) => void;
  variant?: "SUMMARY" | "DETAILED";
  index?: number;
  isPositioned?: boolean;
  totalOverlap?: number;
  overlapIndex?: number;
  isDraggable?: boolean;
}

const STATUS_COLORS: Record<
  "pending" | "done" | "missed",
  { bg: string; 
    border: string; 
    accent: string; text: string; boxShadow: string }
> = {
  pending: {
    bg: "bg-blue-400 shadow-sm dark:bg-blue-500",
    border: "border-blue-200 dark:border-blue-500/40",
    accent: "bg-blue-700",
    text: "text-blue-900 dark:text-blue-50",
    boxShadow: "0 15px 35px -5px rgba(32, 118, 248, 0.24), 0 10px 15px -6px rgba(11, 198, 245, 0.1)",
  },
  done: {
    bg: "bg-green-500 shadow-sm dark:bg-green-600/40",
    border: "border-green-300 dark:border-green-500/50",
    accent: "bg-green-700",
    text: "text-green-900 dark:text-green-50",
    boxShadow: "0 15px 35px -5px rgba(79, 204, 21, 0.63), 0 10px 15px -6px rgba(11, 245, 81, 0.1)",
  },
  missed: {
    bg: "bg-red-400 shadow-sm dark:bg-red-600/30",
    border: "border-red-200 dark:border-red-500/40",
    accent: "bg-red-700",
    text: "text-red-900 dark:text-red-50",
    boxShadow: "0 15px 35px -5px rgba(245, 27, 11, 0.15), 0 10px 15px -6px rgba(245, 27, 11, 0.1)",
  },
};

const VIRTUAL_COLORS: Record<
  "pending" | "done" | "missed",
  { bg: string; 
    border: string; 
    accent: string; text: string; boxShadow: string }
> = {
  pending: {
    bg: "bg-blue-100 shadow-sm dark:bg-blue-600/30",
    border: "border-blue-500/50 dark:border-blue-500",
    accent: "bg-blue-500/50",
    text: "text-blue-900/70 dark:text-blue-100/70",
    boxShadow: "0 15px 35px -5px rgba(32, 118, 248, 0.24), 0 10px 15px -6px rgba(11, 198, 245, 0.1)",
  },
  done: {
    bg: "bg-green-500/50 dark:bg-green-600/50",
    border: "border-green-200/50 dark:border-green-500/30",
    accent: "bg-green-500/50",
    text: "text-green-900/80 dark:text-green-100/80",
    boxShadow: "0 15px 35px -5px rgba(122, 241, 67, 1), 0 10px 15px -6px rgba(11, 245, 81, 0.1)",
  },
  missed: {
    bg: "bg-red-50/70 dark:bg-red-500/10",
    border: "border-red-100/50 dark:border-red-500/20",
    accent: "bg-red-500/50",
    text: "text-red-900/70 dark:text-red-100/70",
    boxShadow: "0 15px 35px -5px rgba(245, 27, 11, 0.15), 0 10px 15px -6px rgba(245, 27, 11, 0.1)",
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
}: CalendarTaskProps) {
  const isVirtual = entry.type === "VIRTUAL";
  const status = entry.status ?? "pending";
  const colors = isVirtual ? VIRTUAL_COLORS[status] : STATUS_COLORS[status];

  // Calculate position if needed
  const getPositionStyle = () => {
    if (!isPositioned) return {};

    const hourHeight = 96; // Matching h-24
    const date = new Date(entry.date);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const top = hours * hourHeight + (minutes * hourHeight) / 60;

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
      width: `${widthPercent - 0.5}%`,
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
        layout
        layoutId={entry.id}
        initial={{ opacity: 0, y: 5 }}
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
          onClick(entry);
        }}
        ref={provided?.innerRef}
        {...safeDraggableProps}
        {...safeDragHandleProps}
        className={`${
          variant === "SUMMARY"
            ? `relative ${overlapIndex > 0 ? "ml-0.5" : ""} h-[10vh] min-h-[40px] max-h-[50px] mb-1 flex w-[calc(100%-4px)] items-center overflow-hidden rounded-xl border border-l-[3px] px-2.5 py-1.5 text-[10px] font-black transition-all ${colors.bg} ${colors.border} ${colors.text}`
            : `relative flex w-full flex-col overflow-hidden rounded-2xl border border-l-[6px] px-3 py-2.5 shadow-sm backdrop-blur-md transition-all ${colors.bg} ${colors.border} ${colors.text}`
        }`}
        style={{
          ...draggableProps?.style,
          ...getPositionStyle(),
          zIndex: isPositioned ? ((isVirtual ? 5 : 10) + overlapIndex) : undefined,
          borderLeftColor: entry.color ?? undefined,
        }}
      >
        {/* Accent Bar Fallback */}
        {!entry.color && (
          <div
            className={`absolute bottom-0 left-0 top-0 w-[4px] ${colors.accent} opacity-100 placeholder:pointer-events-none`}
          />
        )}

        {variant === "SUMMARY" ? (
          <div className={`pointer-events-none ml-1 flex flex-row h-full align-center items-center justify-start w-full items-center gap-2 overflow-hidden ${colors}`}>
            <span className="truncate leading-none">
              {entry.title || "(No title)"}
            </span>
            <span className="shrink-0 text-[10px] font-black opacity-50">
              {format(new Date(entry.date), "h:mm")}
            </span>
          </div>
        ) : (
          <div className={`pointer-events-none ml-1 flex flex-row h-full align-center items-center justify-start gap-2 overflow-hidden ${colors}`}>
            {/* <div className="flex items-start justify-between"> */}
              <span className="truncate text-xs font-black leading-tight">
                {entry.title || "(No title)"}
              </span>
            {/* </div> */}
            <span className="block text-[10px] font-bold opacity-60">
              {format(new Date(entry.date), "h:mm a")}
            </span>
            {entry.duration && entry.duration > 40 && (
              <p className="line-clamp-1 text-[11px] font-medium opacity-50">
                {entry.duration} minutes
              </p>
            )}
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
