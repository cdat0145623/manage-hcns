import { format } from "date-fns";
import { motion } from "framer-motion";

interface CalendarCardProps {
  card: any;
  onClick: (card: any) => void;
  variant?: "SUMMARY" | "DETAILED";
  index?: number;
}

const STATUS_COLORS: Record<
  "pending" | "done" | "missed",
  { bg: string; border: string; accent: string; text: string; boxShadow: string }
> = {
  pending: {
    bg: "bg-blue-100 shadow-sm dark:bg-blue-600/30",
    border: "border-blue-200 dark:border-blue-500/40",
    accent: "bg-blue-700",
    text: "text-blue-900 dark:text-blue-50",
    boxShadow: "0 15px 35px -5px rgba(32, 118, 248, 0.24), 0 10px 15px -6px rgba(11, 198, 245, 0.1)",
  },
  done: {
    bg: "bg-green-200 shadow-sm dark:bg-green-600/40",
    border: "border-green-300 dark:border-green-500/50",
    accent: "bg-green-700",
    text: "text-green-900 dark:text-green-50",
    boxShadow: "0 15px 35px -5px rgba(122, 241, 67, 1), 0 10px 15px -6px rgba(11, 245, 81, 0.1)",
  },
  missed: {
    bg: "bg-red-100 shadow-sm dark:bg-red-600/30",
    border: "border-red-200 dark:border-red-500/40",
    accent: "bg-red-700",
    text: "text-red-900 dark:text-red-50",
    boxShadow: "0 15px 35px -5px rgba(245, 27, 11, 0.15), 0 10px 15px -6px rgba(245, 27, 11, 0.1)",
  },
};

export function CalendarCard({
  card,
  onClick,
  variant = "SUMMARY",
  index = 0,
}: CalendarCardProps) {
  const colors = STATUS_COLORS[card.status as "pending" | "done" | "missed"];

  return (
    <motion.button
      layout
      layoutId={`card-${card.publicId}`}
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
        onClick(card);
      }}
      className={`${
        variant === "SUMMARY"
          ? `relative h-[10vh] min-h-[40px] max-h-[50px] mx-0.5 mb-1 flex w-[calc(100%-4px)] items-center overflow-hidden rounded-xl border border-l-[3px] px-2.5 py-1.5 text-[10px] font-black transition-all ${colors.bg} ${colors.border} ${colors.text}`
          : `relative flex w-full flex-col overflow-hidden rounded-2xl border border-l-[6px] px-3 py-2.5 shadow-sm backdrop-blur-md transition-all ${colors.bg} ${colors.border} ${colors.text}`
      }`}
    >
      <div className="flex w-full flex-col gap-0.5 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-black leading-tight">
            {card.title || "(No title)"}
          </span>
          {card.dueDate && (
            <span className={`shrink-0 text-[9px] font-bold ${colors}`}>
              {format(new Date(card.dueDate), "MMM d")}
            </span>
          )}
        </div>
        
        {/* Board / List Info */}
        <div className={`flex items-center gap-1.5 overflow-hidden text-[9px] font-bold uppercase tracking-wider ${colors}`}>
           <span className="truncate opacity-80">{card.boardName || "Board"}</span>
           <span className="opacity-40">•</span>
           <span className="truncate opacity-60 text-[8px]">{card.listName || "List"}</span>
        </div>

        {/* Labels Summary */}
        {card.labels && card.labels.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {card.labels.slice(0, 3).map((label: any) => (
              <div
                key={label.publicId}
                className="h-1 w-4 rounded-full opacity-60"
                style={{ backgroundColor: label.colourCode || "#cbd5e1" }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.button>
  );
}
