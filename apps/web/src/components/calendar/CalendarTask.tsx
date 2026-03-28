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
}

export function CalendarTask({
  entry,
  onClick,
  variant = "SUMMARY",
  index = 0,
  isPositioned = false,
}: CalendarTaskProps) {
  const isVirtual = entry.type === "VIRTUAL";

  // Calculate position if needed
  const getPositionStyle = () => {
    if (!isPositioned) return {};
    
    const hourHeight = 96; // Matching h-24
    const date = new Date(entry.date);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    const top = (hours * hourHeight) + (minutes * hourHeight / 60);
    const height = Math.max((entry.duration * hourHeight / 60) - 2, 24); // Min height 24pk, sub 2px for margin
    
    return {
      position: "absolute" as const,
      top: `${top}px`,
      height: `${height}px`,
      left: "4px",
      right: "4px",
      width: "calc(100% - 8px)",
      zIndex: isVirtual ? 10 : 20,
    };
  };

  const renderContent = (provided?: DraggableProvided) => {
    // Extract problematic props that conflict with motion.button
    const draggableProps = provided?.draggableProps;
    const dragHandleProps = provided?.dragHandleProps;

    // Specifically remove onDragStart to avoid Framer Motion conflict
    const { onDragStart: _dndDragStart, ...safeDraggableProps } =
      (draggableProps ?? {}) as Record<string, unknown>;
    const { onDragStart: _dndHandleDragStart, ...safeDragHandleProps } =
      (dragHandleProps ?? {}) as Record<string, unknown>;

    return (
      <motion.button
        layout
        layoutId={entry.id}
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 25,
          layout: { type: "spring", stiffness: 300, damping: 25 }
        }}
        whileHover={{ 
          scale: variant === "SUMMARY" ? 1.02 : 1.01,
          y: -2,
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
        }}
        whileTap={{ scale: variant === "SUMMARY" ? 0.98 : 0.99 }}
        onClick={() => onClick(entry)}
        ref={provided?.innerRef}
        {...safeDraggableProps}
        {...safeDragHandleProps}
        className={`${
          variant === "SUMMARY"
            ? `group relative mb-1 flex w-full items-center rounded-md px-2 py-1 text-xs font-medium transition-all ${
                isVirtual
                  ? "border border-dashed border-neutral-300 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400"
                  : "bg-primary-500 dark:bg-primary-600 text-white shadow-sm"
              }`
            : `relative flex w-full flex-col rounded-lg p-3 text-left transition-all ${
                isVirtual
                  ? "border-2 border-dashed border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/30"
                  : "bg-white shadow-md dark:bg-neutral-800"
              }`
        }`}
        style={{
          ...draggableProps?.style,
          ...getPositionStyle(),
          ...(variant === "SUMMARY"
            ? !isVirtual
              ? { backgroundColor: entry.color }
              : { borderColor: entry.color, color: entry.color }
            : !isVirtual
              ? { borderLeft: `8px solid ${entry.color}` }
              : { borderLeft: `8px dashed ${entry.color}` }),
        }}
      >
        {variant === "SUMMARY" ? (
          <>
            <span className="truncate">{entry.title}</span>
            {isVirtual && (
              <span className="ml-auto hidden text-[10px] opacity-70 group-hover:block">
                Create +
              </span>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-bold ${
                  isVirtual
                    ? "text-neutral-600 dark:text-neutral-400"
                    : "text-neutral-900 dark:text-white"
                }`}
              >
                {entry.title}
              </span>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-500">
                {format(entry.date, "HH:mm")}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
              {isVirtual
                ? "Virtual occurrence from Master"
                : "Processed instance task"}
            </p>
            {isVirtual && (
              <div className="mt-2 flex justify-end">
                <span className="bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 rounded px-2 py-0.5 text-[10px] font-bold">
                  Realize Instance
                </span>
              </div>
            )}
          </>
        )}
      </motion.button>
    );
  };

  if (isVirtual) {
    return renderContent();
  }

  return (
    <Draggable draggableId={entry.id} index={index}>
      {(provided) => renderContent(provided)}
    </Draggable>
  );
}
