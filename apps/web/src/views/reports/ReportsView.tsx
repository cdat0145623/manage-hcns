/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable react-hooks/exhaustive-deps */
import { Listbox, Transition } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  HiCalendar,
  HiChartBar,
  HiChartPie,
  HiCheckCircle,
  HiChevronDown,
  HiClipboardDocumentList,
  HiClock,
  HiRectangleStack,
  HiTableCells,
  HiUser,
} from "react-icons/hi2";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
} from "recharts";
import { twMerge } from "tailwind-merge";

import Modal from "~/components/modal";
import { NewWorkspaceForm } from "~/components/NewWorkspaceForm";
import PatternedBackground from "~/components/PatternedBackground";
import { useModal } from "~/providers/modal";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { detectRewardMismatch } from "~/utils/reward";
import { RewardBreachListPopup } from "../card/components/RewardBreachListPopup";
import { DailyTaskKpiChart } from "./components/daily-task-kpi-chart";
import { DailyTaskPenaltyStatistics } from "./components/daily-task-penalty-statistics";
import { TaskProgressChart } from "./components/task-progress-chart";

const CHART_COLORS = [
  "#6366f1", // Indigo
  "#06b6d4", // Cyan
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#ec4899", // Pink
  "#8b5cf6", // Violet
  "#f43f5e", // Rose
  "#14b8a6", // Teal
];

const GAUGE_THEMES = {
  indigo: {
    stroke: "url(#gaugeGradientIndigo)",
    text: "text-indigo-500",
    bg: "bg-indigo-500/10",
    shadow: "shadow-indigo-500/20",
  },
  sky: {
    stroke: "url(#gaugeGradientSky)",
    text: "text-sky-500",
    bg: "bg-sky-500/10",
    shadow: "shadow-sky-500/20",
  },
  emerald: {
    stroke: "url(#gaugeGradientEmerald)",
    text: "text-emerald-500",
    bg: "bg-emerald-500/10",
    shadow: "shadow-emerald-500/20",
  },
} as const;

// ════════════════════════════════════════════════════════════════
// ANIMATED COUNT HOOK
// ════════════════════════════════════════════════════════════════

function useAnimatedNumber(target: number, duration = 1000) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const from = display;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4); // Quartic ease out
      setDisplay(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return display;
}

// ════════════════════════════════════════════════════════════════
// SKELETON WITH SHIMMER
// ════════════════════════════════════════════════════════════════

const SkeletonPulse = ({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) => (
  <div
    className={twMerge(
      "relative overflow-hidden rounded-xl bg-light-200 dark:bg-dark-300",
      className,
    )}
    style={style}
  >
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-dark-100/10" />
  </div>
);

// ════════════════════════════════════════════════════════════════
// FILTER SELECTOR
// ════════════════════════════════════════════════════════════════

function FilterSelector<T>({
  label,
  options,
  value,
  onChange,
  icon,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  icon?: React.ReactNode;
}) {
  const selected = options.find((o) => o.value === value) || options[0];

  return (
    <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-56">
      <label className="pl-1 text-[9px] font-black uppercase tracking-[0.25em] text-neutral-500 dark:text-neutral-400">
        {label}
      </label>
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <Listbox.Button className="relative flex w-full items-center gap-2.5 rounded-xl border border-neutral-200 bg-white py-2.5 pl-3.5 pr-9 text-left text-[13px] text-neutral-900 shadow-sm transition-all hover:border-indigo-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80">
            {icon && (
              <span className="shrink-0 text-indigo-600 dark:text-indigo-400">
                {icon}
              </span>
            )}
            <span className="block truncate font-bold tracking-tight">
              {selected?.label}
            </span>
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
            <Listbox.Options className="absolute left-0 right-0 z-[100] mt-2 max-h-72 overflow-auto rounded-2xl border border-light-200 bg-white p-1 text-sm shadow-xl focus:outline-none dark:border-dark-400 dark:bg-dark-200">
              {options.map((option, idx) => (
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
                  value={option.value}
                >
                  <span className="block truncate font-medium">
                    {option.label}
                  </span>
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}

const DashboardCard = ({
  title,
  children,
  icon,
  className,
  delay = 0,
  headerAction,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  delay?: number;
  headerAction?: React.ReactNode;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={twMerge(
        "group relative flex flex-col rounded-[24px] border border-light-200/50 bg-white/90 p-7 shadow-sm transition-all duration-700 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/5 dark:border-dark-300/40 dark:bg-dark-200/80",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        className,
      )}
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50/80 text-indigo-500 shadow-inner transition-transform duration-500 group-hover:rotate-3 group-hover:scale-110 dark:bg-indigo-500/10 dark:text-indigo-400">
            {icon}
          </div>
          <h3 className="text-base font-bold tracking-tight text-neutral-900 dark:text-dark-1000">
            {title}
          </h3>
        </div>
        {headerAction}
      </div>
      <div className="min-h-[300px] flex-1">{children}</div>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  suffix = "",
  icon,
  color,
  delay = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  color: "indigo" | "cyan" | "emerald" | "rose";
  delay?: number;
}) => {
  const animatedValue = useAnimatedNumber(value);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const themes = {
    indigo: {
      bg: "bg-indigo-50 dark:bg-indigo-500/10",
      border: "border-indigo-100 dark:border-indigo-500/20",
      iconBg: "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20",
      iconText: "text-white",
      accent: "bg-indigo-500",
      colorText: "text-indigo-600 dark:text-indigo-400",
    },
    cyan: {
      bg: "bg-cyan-50 dark:bg-cyan-500/10",
      border: "border-cyan-100 dark:border-cyan-500/20",
      iconBg: "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20",
      iconText: "text-white",
      accent: "bg-cyan-500",
      colorText: "text-cyan-600 dark:text-cyan-400",
    },
    emerald: {
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
      border: "border-emerald-100 dark:border-emerald-500/20",
      iconBg: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20",
      iconText: "text-white",
      accent: "bg-emerald-500",
      colorText: "text-emerald-600 dark:text-emerald-400",
    },
    rose: {
      bg: "bg-rose-50 dark:bg-rose-500/10",
      border: "border-rose-100 dark:border-rose-500/20",
      iconBg: "bg-rose-500 text-white shadow-lg shadow-rose-500/20",
      iconText: "text-white",
      accent: "bg-rose-500",
      colorText: "text-rose-600 dark:text-rose-400",
    },
  };

  const t = themes[color];

  return (
    <div
      className={twMerge(
        "group relative flex items-center gap-6 overflow-hidden rounded-[28px] border p-6 transition-all duration-500 hover:-translate-y-1",
        t.bg,
        t.border,
        isVisible ? "opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <div
        className={twMerge(
          "absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full opacity-10 blur-3xl transition-opacity group-hover:opacity-30",
          t.accent,
        )}
      />
      <div
        className={twMerge(
          "h-15 w-15 flex shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110",
          t.iconBg,
          t.iconText,
        )}
        style={{ width: "60px", height: "60px" }}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-0.5">
        <p
          className={twMerge(
            "text-[10px] font-black uppercase tracking-[0.25em]",
            t.colorText,
          )}
        >
          {label}
        </p>
        <p className="text-3xl font-black tabular-nums tracking-tighter text-neutral-900 dark:text-dark-1000">
          {animatedValue}
          <span className="ml-0.5 text-lg font-bold text-neutral-400/80">
            {suffix}
          </span>
        </p>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// RADIAL GAUGE (ENHANCED)
// ════════════════════════════════════════════════════════════════

const RadialGauge = ({
  rate,
  doneCount,
  totalCount,
  label,
  theme,
}: {
  rate: number;
  doneCount: number;
  totalCount: number;
  label: string;
  theme: keyof typeof GAUGE_THEMES;
}) => {
  const animatedRate = useAnimatedNumber(rate);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * rate) / 100;
  const gt = GAUGE_THEMES[theme];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div className="relative flex items-center justify-center">
        {/* Background Glow */}
        <div
          className={twMerge(
            "absolute h-32 w-32 rounded-full opacity-20 blur-[60px] transition-opacity duration-1000",
            gt.bg,
          )}
        />
        <svg
          className="h-52 w-52 -rotate-90 transform drop-shadow-2xl"
          viewBox="0 0 180 180"
        >
          {/* Subtle Outer Ring */}
          <circle
            cx="90"
            cy="90"
            r={radius + 8}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-light-200/30 dark:text-dark-400/20"
          />
          {/* Main Track */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-light-100/50 dark:text-dark-300/20"
          />
          {/* Progress Arc */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke={gt.stroke}
            strokeWidth="14"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span
            className={twMerge(
              "text-5xl font-black tabular-nums tracking-tighter drop-shadow-sm",
              gt.text,
            )}
          >
            {animatedRate}%
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-baseline gap-1.5 font-bold">
          <span className="text-2xl tracking-tighter text-neutral-900 dark:text-dark-1000">
            {doneCount}
          </span>
          <span className="text-light-300 dark:text-dark-600">/</span>
          <span className="text-sm text-light-500 dark:text-dark-500">
            {totalCount}
          </span>
        </div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-light-500/80 dark:text-dark-700">
          {label}
        </p>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// CUSTOM COMPONENTS FOR CHARTS
// ════════════════════════════════════════════════════════════════

const getPath = (
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  return `M${x},${y + height}
          L${x},${y + radius}
          A${radius},${radius} 0 0 1 ${x + radius},${y}
          L${x + width - radius},${y}
          A${radius},${radius} 0 0 1 ${x + width},${y + radius}
          L${x + width},${y + height}
          Z`;
};

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
    props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 12}
        outerRadius={outerRadius + 15}
        fill={fill}
      />
    </g>
  );
};

// ════════════════════════════════════════════════════════════════
// MAIN VIEW
// ════════════════════════════════════════════════════════════════

interface User {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  role: "NVVP" | "ADMIN" | "AREA_MANAGER" | "BRANCH_MANAGER";
}

export default function ReportsView() {
  const { workspace, hasLoaded } = useWorkspace();
  const now = new Date();

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [boardPublicId, setBoardPublicId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"week" | "month" | "year">("month");
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [week, setWeek] = useState<number>(1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [activeIndex, setActiveIndex] = useState(-1);
  const [performanceView, setPerformanceView] = useState<
    "status" | "kpi" | "trend"
  >("status");

  const { modalContentType, openModal, closeModal, isOpen } = useModal();

  // const { data: users } = api.user.getAll.useQuery();
  const { data: currentUser } = api.user.getUser.useQuery();
  const [users, setUsers] = useState<User[]>([]);
  const { data: allUsers } = api.user.getAll.useQuery(undefined, {
    enabled: currentUser?.role === "ADMIN",
  });

  const { data: workspaceData } = api.workspace.byId.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: hasLoaded && !!workspace.publicId },
  );

  const { data: boardsData } = api.board.all.useQuery(
    { workspacePublicId: workspace.publicId, type: "regular" },
    { enabled: hasLoaded && !!workspace.publicId },
  );

  useEffect(() => {
    if (currentUser?.role === "ADMIN") {
      const u = allUsers ?? [];
      setUsers(u);
      const firstUser = u[0];
      if (!selectedUserId && firstUser) {
        setSelectedUserId(firstUser.id);
      }
    } else if (currentUser) {
      setUsers([currentUser]);
      if (!selectedUserId) {
        setSelectedUserId(currentUser.id);
      }
    }
  }, [currentUser, allUsers, selectedUserId]);

  useEffect(() => {
    if (boardsData) {
      const isValid = boardsData.some((b) => b.publicId === boardPublicId);
      if (!isValid && boardsData.length > 0) {
        const now = new Date();
        const m = now.getMonth() + 1;
        const y = now.getFullYear();
        const monthLabel = `Tháng ${m}`;
        const yearLabel = `${y}`;

        // Try to find a board that matches both month and year, or just month
        const bestMatch =
          boardsData.find(
            (b) => b.name.includes(monthLabel) && b.name.includes(yearLabel),
          ) ||
          boardsData.find((b) => b.name.includes(monthLabel)) ||
          boardsData[0];

        setBoardPublicId(bestMatch?.publicId || "");
      } else if (!isValid && boardsData.length === 0) {
        setBoardPublicId("");
      }
    }
  }, [boardsData, boardPublicId]);

  const { data: metrics, isLoading } = api.dashboard.get.useQuery(
    { selectedUserId, boardPublicId, viewMode, month, week, year },
    { enabled: !!selectedUserId && boardsData !== undefined },
  );

  const penaltyStatisticsQuery = api.taskPenalty.statistics.useQuery(
    {
      month: `${year}-${String(month).padStart(2, "0")}`,
      targetUserId: selectedUserId,
    },
    {
      enabled: !!currentUser && !!selectedUserId,
    },
  );

  // --- REWARD BREACH DETECTION ---
  const { data: pendingRewards } = api.reward.getPendingApprovals.useQuery(
    { boardPublicId, selectedUserId },
    {
      enabled:
        currentUser?.role === "ADMIN" && !!selectedUserId && !!boardPublicId,
    },
  );

  const [hasShownBreachPopup, setHasShownBreachPopup] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (
      pendingRewards &&
      selectedUserId &&
      hasShownBreachPopup !== selectedUserId
    ) {
      const breached = pendingRewards.filter((r: any) => {
        const mismatch = detectRewardMismatch(
          {
            title: r.cardTitle || "Untitled",
            startDate: r.startDate,
            dueDate: r.dueDate,
            assigneeId: r.targetUser,
            bonusAmount: r.bonusAmount,
            currency: r.currency,
            deductions: r.deductions,
          },
          r.snapshot,
        );
        return mismatch.hasMismatch;
      });

      if (breached.length > 0) {
        setHasShownBreachPopup(selectedUserId);
        openModal("REWARD_BREACH_REVIEW");
      }
    }
  }, [pendingRewards, selectedUserId, hasShownBreachPopup]);

  const memberOptions = users
    .filter((u) => u != null && !!u.id)
    .map((u) => ({
      label: u.name || "Unknown User",
      value: u.id,
    }));

  const boardOptions = (boardsData || []).map((b) => ({
    label: b.name,
    value: b.publicId,
  }));

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    label: `Tháng ${i + 1}`,
    value: i + 1,
  }));

  const yearOptions = Array.from({ length: 5 }, (_, i) => ({
    label: (now.getFullYear() - 2 + i).toString(),
    value: now.getFullYear() - 2 + i,
  }));

  const viewModeOptions = [
    { label: "Tuần", value: "week" as const },
    { label: "Tháng", value: "month" as const },
    { label: "Năm", value: "year" as const },
  ];

  const weekOptions = Array.from({ length: 52 }, (_, i) => ({
    label: `Tuần ${i + 1}`,
    value: i + 1,
  }));

  const calendarMetrics = metrics?.calendar;
  const isCalendarDataLoading = isLoading;

  const rawPieData = metrics?.kanban?.cardDistributionByList?.data || [];
  const pieData = rawPieData.filter((d: any) => d.cardCount > 0);
  const taskProgressData = calendarMetrics?.taskProgressBreakdown?.data || [];
  const dailyKpiData = calendarMetrics?.dailyKpiBreakdown?.data || [];
  const totalCards = metrics?.kanban?.cardDistributionByList?.totalCards || 0;

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 z-0">
        <PatternedBackground />
        <div className="absolute inset-0 bg-gradient-to-tr from-light-50 via-transparent to-light-100 mix-blend-overlay dark:from-dark-50 dark:to-dark-100" />
        <div className="absolute inset-0 bg-light-50 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-dark-50" />
      </div>

      <svg className="absolute h-0 w-0">
        <defs>
          <linearGradient id="gaugeGradientIndigo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
          <linearGradient id="gaugeGradientSky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="gaugeGradientEmerald" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative z-10 p-6 md:p-10 lg:p-12">
        <header className="relative z-30 mb-16 flex flex-col gap-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-8">
            <div className="group relative">
              <div className="absolute -inset-2 rounded-[28px] bg-indigo-500/20 blur-xl transition-all group-hover:bg-indigo-500/30" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-[28px] bg-indigo-600 text-white shadow-2xl transition-transform hover:scale-105 active:scale-95">
                <HiChartBar size={40} />
              </div>
            </div>
            <div>
              <h1 className="whitespace-nowrap text-3xl font-black tracking-tight text-neutral-900 dark:text-dark-1000">
                Bảng điều khiển
              </h1>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-4 max-w-[250px] truncate rounded-full bg-indigo-500/10 px-2 text-[10px] font-extrabold uppercase leading-4 tracking-widest text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
                  {users?.find((u) => u.id === selectedUserId)?.name ||
                    workspace.name}
                </div>

                <div className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-50/50 px-2 py-0.5 ring-1 ring-indigo-500/10 dark:bg-indigo-900/20 dark:ring-indigo-400/20">
                  <p className="text-[10px] font-bold tracking-wide text-indigo-600/80 dark:text-indigo-400">
                    Thông số & chỉ số
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center rounded-[32px] border border-light-200/60 bg-white/50 p-6 shadow-xl ring-1 ring-light-100/50 backdrop-blur-3xl dark:border-dark-400/30 dark:bg-dark-200/30">
            <div className="flex flex-nowrap items-center gap-6">
              <div className="w-[220px]">
                <FilterSelector
                  label="Nhân viên"
                  options={memberOptions}
                  value={selectedUserId}
                  onChange={setSelectedUserId}
                  icon={<HiUser size={18} />}
                />
              </div>
              <div className="w-[220px]">
                <FilterSelector
                  label="Bảng"
                  options={boardOptions}
                  value={boardPublicId}
                  onChange={setBoardPublicId}
                  icon={<HiTableCells size={18} />}
                />
              </div>
            </div>
          </div>
        </header>

        {/* KPI Grid */}
        <section className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            Array(4)
              .fill(0)
              .map((_, i) => <SkeletonPulse key={i} className="h-28" />)
          ) : (
            <>
              <StatCard
                label="Công việc khác"
                value={totalCards}
                icon={<HiRectangleStack size={28} />}
                color="indigo"
              />
              <StatCard
                label="Tỷ lệ đúng hạn (khác)"
                value={metrics?.kanban?.deadlineCompletionRate?.rate || 0}
                suffix="%"
                icon={<HiClock size={28} />}
                color="cyan"
                delay={100}
              />
              <StatCard
                label="Tỷ lệ hoàn thành (hằng ngày)"
                value={calendarMetrics?.taskCompletionRate?.rate || 0}
                suffix="%"
                icon={<HiCheckCircle size={28} />}
                color="emerald"
                delay={200}
              />
              <StatCard
                label="Tỷ lệ đúng hạn (ngày)"
                value={calendarMetrics?.deadlineCompletionRate?.rate || 0}
                suffix="%"
                icon={<HiClipboardDocumentList size={28} />}
                color="rose"
                delay={300}
              />
            </>
          )}
        </section>

        {/* Charts Section */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          {/* Kanban Segment */}
          <DashboardCard
            title="Bảng tỉ lệ"
            icon={<HiChartPie size={20} />}
            delay={200}
          >
            {isLoading ? (
              <SkeletonPulse className="mx-auto h-64 max-w-[250px] rounded-full" />
            ) : totalCards > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <circle
                    cx="50%"
                    cy="45%"
                    r="65"
                    className="fill-light-50 dark:fill-dark-300"
                    opacity={0.3}
                  />
                  {/* @ts-ignore */}
                  <Pie
                    {...({
                      activeIndex: activeIndex,
                      activeShape: renderActiveShape,
                      data: pieData,
                      cx: "50%",
                      cy: "45%",
                      innerRadius: 70,
                      outerRadius: 100,
                      paddingAngle: 6,
                      dataKey: "cardCount",
                      nameKey: "listName",
                      onMouseEnter: (_: any, index: number) =>
                        setActiveIndex(index),
                      onMouseLeave: () => setActiveIndex(-1),
                      animationDuration: 1500,
                    } as any)}
                  >
                    {pieData.map((_: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="w-[200px] rounded-xl border border-light-200 bg-white/90 p-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] backdrop-blur-xl dark:border-dark-400 dark:bg-dark-300">
                          <p className="mb-1 text-sm font-black text-neutral-900 dark:text-dark-1000">
                            {d.listName}
                          </p>
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600">
                            {d.cardCount} Cards · {d.percentage}%
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(val) => (
                      <span className="ml-4 text-[10px] font-extrabold uppercase tracking-[0.2em] text-light-500/80">
                        {val}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-4 text-light-400">
                <div className="rounded-full bg-light-100 p-6 dark:bg-dark-300">
                  <HiChartPie size={48} className="opacity-20" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest">{t`No cards found`}</p>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Tỉ lệ đúng hạn (công việc khác)"
            icon={<HiClock size={20} />}
            delay={300}
          >
            {isLoading ? (
              <SkeletonPulse className="mx-auto h-64 max-w-[250px] rounded-full" />
            ) : (
              <RadialGauge
                rate={metrics?.kanban?.deadlineCompletionRate?.rate || 0}
                doneCount={
                  metrics?.kanban?.deadlineCompletionRate?.onTimeCount || 0
                }
                totalCount={
                  metrics?.kanban?.deadlineCompletionRate?.totalCards || 0
                }
                label="Thẻ đúng hạn"
                theme="indigo"
              />
            )}
          </DashboardCard>

          {/* Calendar Segment */}
          <DashboardCard
            title="Tỉ lệ hoàn thành (công việc hằng ngày)"
            icon={<HiCheckCircle size={20} />}
            delay={400}
          >
            {isCalendarDataLoading ? (
              <SkeletonPulse className="mx-auto h-64 max-w-[250px] rounded-full" />
            ) : (
              <RadialGauge
                rate={calendarMetrics?.taskCompletionRate?.rate || 0}
                doneCount={calendarMetrics?.taskCompletionRate?.doneCount || 0}
                totalCount={
                  calendarMetrics?.taskCompletionRate?.totalCount || 0
                }
                label="Công việc đã xong"
                theme="emerald"
              />
            )}
          </DashboardCard>

          <DashboardCard
            title="Tỉ lệ đúng hạn (công việc hằng ngày)"
            icon={<HiClipboardDocumentList size={20} />}
            delay={500}
          >
            {isCalendarDataLoading ? (
              <SkeletonPulse className="mx-auto h-64 max-w-[250px] rounded-full" />
            ) : (
              <RadialGauge
                rate={calendarMetrics?.deadlineCompletionRate?.rate || 0}
                doneCount={
                  calendarMetrics?.deadlineCompletionRate?.onTimeCount || 0
                }
                totalCount={
                  calendarMetrics?.deadlineCompletionRate?.totalCount || 0
                }
                label="Nhiệm vụ đúng giờ"
                theme="sky"
              />
            )}
          </DashboardCard>

          {/* Detailed Performance Section */}
          <div className="lg:col-span-2">
            <DashboardCard
              title="Chi tiết hiệu suất (công việc hằng ngày)"
              icon={<HiChartBar size={20} />}
              delay={600}
              headerAction={
                <FilterSelector
                  label="Hiển thị"
                  value={performanceView}
                  onChange={setPerformanceView}
                  options={[
                    { label: "Trạng thái công việc", value: "status" as const },
                    { label: "Tỷ lệ hoàn thành", value: "kpi" as const },
                    { label: "Xu hướng theo ngày", value: "trend" as const },
                  ]}
                  icon={<HiChartBar className="h-4 w-4" />}
                />
              }
            >
              {isCalendarDataLoading ? (
                <SkeletonPulse className="h-80 w-full" />
              ) : performanceView === "status" &&
                taskProgressData.length > 0 ? (
                <TaskProgressChart data={taskProgressData} />
              ) : performanceView === "kpi" && taskProgressData.length > 0 ? (
                <DailyTaskKpiChart
                  mode="kpi"
                  taskData={taskProgressData}
                  dayData={dailyKpiData}
                />
              ) : performanceView === "trend" && dailyKpiData.length > 0 ? (
                <DailyTaskKpiChart
                  mode="trend"
                  taskData={taskProgressData}
                  dayData={dailyKpiData}
                />
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-4 text-light-400">
                  <div className="rounded-full bg-light-100 p-6 dark:bg-dark-300">
                    <HiChartBar size={48} className="opacity-20" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest">{t`No tasks found`}</p>
                </div>
              )}
            </DashboardCard>
          </div>

          <div className="lg:col-span-2">
            <DashboardCard
              title="Thống kê khấu trừ Daily Task"
              icon={<HiClipboardDocumentList size={20} />}
              delay={700}
            >
              {penaltyStatisticsQuery.isLoading ? (
                <SkeletonPulse className="h-80 w-full" />
              ) : penaltyStatisticsQuery.isError ? (
                <div className="flex h-64 items-center justify-center text-sm text-rose-600">
                  {t`Không thể tải thống kê khấu trừ`}
                </div>
              ) : (
                <DailyTaskPenaltyStatistics
                  entries={penaltyStatisticsQuery.data?.entries ?? []}
                  total={
                    penaltyStatisticsQuery.data?.total ?? {
                      count: 0,
                      amountVnd: 0,
                    }
                  }
                />
              )}
            </DashboardCard>
          </div>
        </div>
      </div>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "NEW_WORKSPACE"}
      >
        <NewWorkspaceForm />
      </Modal>

      <Modal
        modalSize="md"
        isVisible={isOpen && modalContentType === "REWARD_BREACH_REVIEW"}
      >
        <RewardBreachListPopup
          userId={selectedUserId}
          userName={users.find((u) => u.id === selectedUserId)?.name || ""}
          cards={pendingRewards || []}
          onReviewCard={(publicId) => {
            closeModal();
            openModal("CARD_DETAILS", publicId);
          }}
          onClose={() => closeModal()}
        />
      </Modal>

      <style jsx global>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
