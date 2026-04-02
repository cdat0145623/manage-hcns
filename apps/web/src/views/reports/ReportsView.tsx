/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-unnecessary-condition */
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
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { twMerge } from "tailwind-merge";

import PatternedBackground from "~/components/PatternedBackground";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

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
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-light-600 dark:text-dark-700">
        {label}
      </label>
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <Listbox.Button className="relative flex w-full items-center gap-2.5 rounded-xl border border-light-300/60 bg-white/40 py-2.5 pl-3 pr-10 text-left text-sm text-neutral-900 shadow-sm transition-all hover:bg-white/80 hover:shadow-indigo-500/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-dark-400/40 dark:bg-dark-300/40 dark:text-dark-950 dark:hover:bg-dark-300/80">
            {icon && (
              <span className="text-indigo-500 dark:text-indigo-400">
                {icon}
              </span>
            )}
            <span className="block truncate font-semibold">
              {selected?.label}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <HiChevronDown className="h-4 w-4 text-light-500" />
            </span>
          </Listbox.Button>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-150"
            enterFrom="opacity-0 translate-y-1 scale-95"
            enterTo="opacity-100 translate-y-0 scale-100"
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Listbox.Options className="absolute -left-1 z-[100] mt-2 max-h-60 min-w-[160px] overflow-auto rounded-2xl border border-light-200 bg-white/95 p-1 text-sm shadow-2xl backdrop-blur-md focus:outline-none dark:border-dark-400 dark:bg-dark-200/95 sm:left-auto sm:right-0">
              {options.map((option, idx) => (
                <Listbox.Option
                  key={idx}
                  className={({ active }) =>
                    twMerge(
                      "relative cursor-pointer select-none rounded-xl py-2.5 pl-4 pr-4 transition-all",
                      active
                        ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                        : "text-neutral-900 dark:text-dark-950",
                    )
                  }
                  value={option.value}
                >
                  <span className="block truncate">{option.label}</span>
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD CARD WRAPPER
// ════════════════════════════════════════════════════════════════

const DashboardCard = ({
  title,
  children,
  icon,
  className,
  delay = 0,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  delay?: number;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={twMerge(
        "group flex flex-col rounded-[24px] border border-light-200/50 bg-white/90 p-7 shadow-sm transition-all duration-700 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/5 dark:border-dark-300/40 dark:bg-dark-200/80",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        className,
      )}
    >
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50/80 text-indigo-500 shadow-inner transition-transform duration-500 group-hover:rotate-3 group-hover:scale-110 dark:bg-indigo-500/10 dark:text-indigo-400">
            {icon}
          </div>
          <h3 className="text-base font-bold tracking-tight text-neutral-900 dark:text-dark-1000">
            {title}
          </h3>
        </div>
      </div>
      <div className="min-h-[300px] flex-1">{children}</div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// STAT CARD (KPI)
// ════════════════════════════════════════════════════════════════

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
    indigo: "border-l-indigo-500 bg-indigo-50/30 text-indigo-600",
    cyan: "border-l-cyan-500 bg-cyan-50/30 text-cyan-600",
    emerald: "border-l-emerald-500 bg-emerald-50/30 text-emerald-600",
    rose: "border-l-rose-500 bg-rose-50/30 text-rose-600",
  };

  return (
    <div
      className={twMerge(
        "relative flex items-center gap-5 overflow-hidden rounded-2xl border-l-4 border-light-200 bg-white p-5 shadow-sm transition-all duration-700 hover:shadow-xl dark:bg-dark-200",
        themes[color],
        isVisible ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0",
      )}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-current shadow-sm dark:bg-dark-300/80">
        {icon}
      </div>
      <div>
        <p className="text-3xl font-black tabular-nums tracking-tighter text-neutral-900 dark:text-dark-1000">
          {animatedValue}
          {suffix}
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-light-700 dark:text-dark-700/80">
          {label}
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
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="relative flex items-center justify-center">
        <svg
          className="h-48 w-48 -rotate-90 transform drop-shadow-xl"
          viewBox="0 0 180 180"
        >
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="14"
            className="text-light-100 dark:text-dark-300/40"
          />
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
              "text-5xl font-black tabular-nums tracking-tighter",
              gt.text,
            )}
          >
            {animatedRate}%
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-neutral-900 dark:text-dark-1000">
            {doneCount}
          </span>
          <span className="text-light-400 dark:text-dark-700">/</span>
          <span className="text-lg font-medium text-light-500 dark:text-dark-600">
            {totalCount}
          </span>
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-light-600 dark:text-dark-700">
          {label}
        </p>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// CUSTOM BAR COMPONENTS (V3)
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

const CustomBar = (props: any) => {
  const { fill, x, y, width, height } = props;
  if (height <= 0) return null;

  const radius = Math.min(width / 2, 10);
  return (
    <path
      d={getPath(x, y, width, height, radius)}
      stroke="none"
      fill={fill}
      className="transition-all duration-500"
    />
  );
};

const CustomXAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const name = payload.value;
  const truncatedName = name.length > 12 ? name.substring(0, 10) + "..." : name;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={16}
        textAnchor="end"
        fill="#64748b"
        transform="rotate(-35)"
        className="text-[11px] font-bold"
      >
        {truncatedName}
      </text>
    </g>
  );
};

// ════════════════════════════════════════════════════════════════
// INTERACTIVE PIE PIECE
// ════════════════════════════════════════════════════════════════

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
// MAIN VIEW (ULTRA PREMIUM V3)
// ════════════════════════════════════════════════════════════════

export default function ReportsView() {
  const { workspace } = useWorkspace();
  const now = new Date();

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [boardPublicId, setBoardPublicId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"week" | "month" | "year">("month");
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [week, setWeek] = useState<number>(1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [activeIndex, setActiveIndex] = useState(-1);

  const { data: workspaceData } = api.workspace.byId.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: !!workspace.publicId },
  );

  const { data: boardsData } = api.board.all.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: !!workspace.publicId },
  );

  useEffect(() => {
    if (workspaceData?.members?.[0] && !selectedUserId) {
      const defaultMember =
        workspaceData.members.find((m) => m.role === "ADMIN") ||
        workspaceData.members[0];
      setSelectedUserId(defaultMember.user?.id || "");
    }
  }, [workspaceData]);

  useEffect(() => {
    if (boardsData?.[0] && !boardPublicId) {
      setBoardPublicId(boardsData[0].publicId);
    }
  }, [boardsData]);

  const { data: metrics, isLoading } = api.dashboard.get.useQuery(
    { selectedUserId, boardPublicId, viewMode, month, week, year },
    { enabled: !!selectedUserId && !!boardPublicId },
  );

  const memberOptions = (workspaceData?.members || [])
    .map((m) => ({
      label: m.user?.name || m.email || "Unknown Member",
      value: m.user?.id || "",
    }))
    .filter((o) => o.value !== "");

  const boardOptions = (boardsData || []).map((b) => ({
    label: b.name,
    value: b.publicId,
  }));

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    label: new Date(0, i).toLocaleString("default", { month: "long" }),
    value: i + 1,
  }));

  const yearOptions = Array.from({ length: 5 }, (_, i) => ({
    label: (now.getFullYear() - 2 + i).toString(),
    value: now.getFullYear() - 2 + i,
  }));

  const viewModeOptions = [
    { label: t`Week`, value: "week" as const },
    { label: t`Month`, value: "month" as const },
    { label: t`Year`, value: "year" as const },
  ];

  const weekOptions = Array.from({ length: 52 }, (_, i) => ({
    label: t`Week ${i + 1}`,
    value: i + 1,
  }));

  const pieData = metrics?.kanban?.cardDistributionByList?.data || [];
  const taskProgressData = metrics?.calendar?.taskProgressBreakdown?.data || [];
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
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative z-10 p-6 md:p-10 lg:p-12">
        <header className="relative z-30 mb-12 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-indigo-600 text-white shadow-2xl shadow-indigo-600/30 ring-8 ring-indigo-600/10 transition-transform hover:scale-105 active:scale-95">
              <HiChartBar size={32} />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tighter text-neutral-900 dark:text-dark-1000">
                {t`Dashboard`}
              </h1>

              <p className="text-[11px] font-bold uppercase tracking-widest text-light-600 dark:text-dark-700/60">
                {t`Workspace Insights & Metrics`}
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-light-200 bg-white/40 p-5 shadow-2xl ring-1 ring-light-100 backdrop-blur-2xl dark:border-dark-400/40 dark:bg-dark-200/40">
            <div className="grid grid-cols-2 gap-4 sm:min-w-[800px] lg:grid-cols-5">
              <FilterSelector
                label={t`Employee`}
                options={memberOptions}
                value={selectedUserId}
                onChange={setSelectedUserId}
                icon={<HiUser size={18} />}
              />
              <FilterSelector
                label={t`Board`}
                options={boardOptions}
                value={boardPublicId}
                onChange={setBoardPublicId}
                icon={<HiTableCells size={18} />}
              />
              <FilterSelector
                label={t`View`}
                options={viewModeOptions}
                value={viewMode}
                onChange={setViewMode}
                icon={<HiChartBar size={18} />}
              />
              {viewMode === "month" && (
                <FilterSelector
                  label={t`Month`}
                  options={monthOptions}
                  value={month}
                  onChange={setMonth}
                  icon={<HiCalendar size={18} />}
                />
              )}
              {viewMode === "week" && (
                <FilterSelector
                  label={t`Week`}
                  options={weekOptions}
                  value={week}
                  onChange={setWeek}
                  icon={<HiCalendar size={18} />}
                />
              )}
              {viewMode === "year" && (
                 <div className="flex flex-col gap-1.5 opacity-40 pointer-events-none">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-light-600 dark:text-dark-700">{t`Selection`}</label>
                    <div className="h-10 rounded-xl border border-light-300/60 bg-white/20" />
                 </div>
              )}
              <FilterSelector
                label={t`Year`}
                options={yearOptions}
                value={year}
                onChange={setYear}
                icon={<HiCalendar size={18} />}
              />
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
                label={t`Total Cards`}
                value={totalCards}
                icon={<HiRectangleStack size={28} />}
                color="indigo"
              />
              <StatCard
                label={t`On-Time Rate`}
                value={metrics?.kanban?.deadlineCompletionRate?.rate || 0}
                suffix="%"
                icon={<HiClock size={28} />}
                color="cyan"
                delay={100}
              />
              <StatCard
                label={t`Completed`}
                value={metrics?.calendar?.taskCompletionRate?.rate || 0}
                suffix="%"
                icon={<HiCheckCircle size={28} />}
                color="emerald"
                delay={200}
              />
              <StatCard
                label={t`Calendar Rate`}
                value={metrics?.calendar?.deadlineCompletionRate?.rate || 0}
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
            title={t`Board Distribution`}
            icon={<HiChartPie size={20} />}
            delay={200}
          >
            {isLoading ? (
              <SkeletonPulse className="mx-auto h-64 max-w-[250px] rounded-full" />
            ) : pieData.length > 0 ? (
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
                        <div className="rounded-xl border border-light-200 bg-white p-3 shadow-2xl dark:border-dark-400 dark:bg-dark-300">
                          <p className="text-sm font-black text-neutral-900 dark:text-dark-1000">
                            {d.listName}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-light-600">
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
                      <span className="ml-4 text-[11px] font-bold uppercase tracking-widest text-light-600">
                        {val}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </DashboardCard>
          <DashboardCard
            title={t`Deadline Metrics`}
            icon={<HiClock size={20} />}
            delay={400}
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
                label={t`Cards On Time`}
                theme="indigo"
              />
            )}
          </DashboardCard>

          {/* New Full Width Section (V3 - Ultra Premium Vertical Chart) */}
          <div className="lg:col-span-2">
            <DashboardCard
              title={t`Detailed Task Performance`}
              icon={<HiChartBar size={20} />}
              delay={600}
            >
              {isLoading ? (
                <SkeletonPulse className="h-80 w-full" />
              ) : taskProgressData.length > 0 ? (
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={taskProgressData.map((d: any) => ({
                        ...d,
                        pending: 100 - (d.completionRate || 0),
                      }))}
                      margin={{ top: 40, right: 30, left: 0, bottom: 80 }}
                    >
                      <defs>
                        <filter
                          id="shadow"
                          x="-20%"
                          y="-20%"
                          width="140%"
                          height="140%"
                        >
                          <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                          <feOffset dx="2" dy="2" result="offsetblur" />
                          <feComponentTransfer>
                            <feFuncA type="linear" slope="0.2" />
                          </feComponentTransfer>
                          <feMerge>
                            <feMergeNode />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        strokeOpacity={0.05}
                      />
                      <XAxis
                        dataKey="taskName"
                        interval={0}
                        tick={<CustomXAxisTick />}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{
                          fontSize: 11,
                          fontWeight: 700,
                          fill: "#94a3b8",
                        }}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                        domain={[0, 100]}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(99, 102, 241, 0.04)" }}
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="overflow-hidden rounded-xl border border-light-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-dark-400 dark:bg-dark-300/95">
                              <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-indigo-500 to-purple-500" />
                              <p className="mb-2 text-sm font-black text-neutral-900 dark:text-dark-1000">
                                {d.taskName}
                              </p>
                              <div className="flex items-center justify-between gap-8">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-light-500">{t`Completion`}</span>
                                <span className="text-sm font-black text-indigo-500">
                                  {d.completionRate}%
                                </span>
                              </div>
                              <div className="mt-2 h-1.5 w-full rounded-full bg-light-100 dark:bg-dark-400">
                                <div
                                  className="h-full rounded-full bg-indigo-500"
                                  style={{ width: `${d.completionRate}%` }}
                                />
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        name={t`Progress`}
                        dataKey="completionRate"
                        stackId="stack"
                        fill="url(#barGradient)"
                        shape={<CustomBar />}
                        animationDuration={1500}
                        animationEasing="ease-out"
                      />
                      <Bar
                        name={t`Pending`}
                        dataKey="pending"
                        stackId="stack"
                        fill="currentColor"
                        className="text-light-100/50 dark:text-dark-300/10"
                        radius={[10, 10, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
        </div>
      </div>

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
