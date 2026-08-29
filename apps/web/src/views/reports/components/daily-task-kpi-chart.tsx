import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { t } from "@lingui/core/macro";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  getDailyTaskKpiChartHeight,
  truncateDailyTaskKpiLabel,
} from "./daily-task-kpi-chart-utils";

export interface DailyTaskKpiTaskDatum {
  taskId: string;
  taskName: string;
  doneCount: number;
  missedCount: number;
  pendingCount: number;
  totalCount: number;
  completedDoneCount: number;
  completedMissedCount: number;
  completedTotalCount: number;
  completionRateToDate: number;
}

export interface DailyTaskKpiDayDatum {
  date: string;
  doneCount: number;
  missedCount: number;
  pendingCount: number;
  kpiRate: number | null;
}

interface DailyTaskKpiChartProps {
  mode: "kpi" | "trend";
  taskData: DailyTaskKpiTaskDatum[];
  dayData: DailyTaskKpiDayDatum[];
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  backgroundColor: "#ffffff",
  fontSize: 12,
};

const formatCompletionTooltip = (
  value: ValueType | undefined,
  name: NameType | undefined,
) =>
  [
    value === undefined ? t`Chưa có dữ liệu` : `${Number(value)}%`,
    name === "completionRateToDate" ? t`Tỷ lệ hoàn thành` : (name ?? ""),
  ] as [string, NameType];

const formatTrendTooltip = (
  value: ValueType | undefined,
  name: NameType | undefined,
) =>
  [
    value === undefined ? t`Chưa có KPI` : `${Number(value)}%`,
    name === "kpiRate" ? t`Tỷ lệ KPI` : (name ?? ""),
  ] as [string, NameType];

export function DailyTaskKpiChart({
  mode,
  taskData,
  dayData,
}: DailyTaskKpiChartProps) {
  if (mode === "trend") {
    return (
      <div className="h-80 w-full" aria-label={t`Xu hướng KPI theo ngày`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={dayData}
            margin={{ top: 12, right: 20, left: 4, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="#cbd5e1"
              strokeOpacity={0.45}
            />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={formatTrendTooltip}
            />
            <Line
              type="monotone"
              dataKey="kpiRate"
              name="kpiRate"
              stroke="#6366f1"
              strokeWidth={3}
              connectNulls={false}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const sortedData = [...taskData]
    .filter((entry) => entry.completedTotalCount > 0)
    .sort((a, b) => a.completionRateToDate - b.completionRateToDate)
    .map((entry) => ({
      ...entry,
      completionLabel: `${entry.completedDoneCount} / ${entry.completedTotalCount}`,
    }));
  const chartHeight = getDailyTaskKpiChartHeight(sortedData.length);

  if (sortedData.length === 0) {
    return (
      <div
        className="flex h-80 items-center justify-center text-sm text-neutral-500"
        aria-label={t`Chưa có task đã kết luận để tính tỷ lệ hoàn thành`}
      >
        {t`Chưa có task đã kết luận để tính tỷ lệ hoàn thành`}
      </div>
    );
  }

  return (
    <div
      className="w-full"
      style={{ height: chartHeight }}
      aria-label={t`Tỷ lệ hoàn thành theo task`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
        >
          <CartesianGrid
            horizontal={false}
            strokeDasharray="4 4"
            stroke="#cbd5e1"
            strokeOpacity={0.45}
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(value) => `${value}%`}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
          />
          <YAxis
            type="category"
            dataKey="taskName"
            width={180}
            tick={{ fontSize: 11, fontWeight: 700, fill: "#475569" }}
            interval={0}
            tickFormatter={(value) => truncateDailyTaskKpiLabel(String(value))}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={formatCompletionTooltip}
          />
          <Bar
            dataKey="completionRateToDate"
            name="completionRateToDate"
            fill="#3f806d"
            barSize={28}
            radius={[0, 8, 8, 0]}
          >
            <LabelList
              dataKey="completionLabel"
              position="right"
              fill="#475569"
              fontSize={11}
              fontWeight={700}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
