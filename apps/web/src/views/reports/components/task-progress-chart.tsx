import { t } from "@lingui/core/macro";
import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import {
  getTaskNameAxisWidth,
  getTaskProgressChartHeight,
  getTaskProgressLabel,
  splitTaskName,
} from "./task-progress-chart-utils";

const CHART_COLORS = {
  done: "#3f806d",
  missed: "#b75862",
  pending: "#8d9baa",
} as const;

export interface TaskProgressDatum {
  taskName: string;
  doneCount: number;
  missedCount: number;
  pendingCount: number;
  totalCount: number;
  completionRate: number;
  missedRate: number;
  pendingRate: number;
}

interface TaskProgressChartProps {
  data: TaskProgressDatum[];
}

interface TaskNameTickProps {
  x?: number;
  y?: number;
  maxLineLength?: number;
  payload?: {
    value?: string;
  };
}

interface SegmentLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
}

const toNumber = (value: number | string | undefined) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const TaskNameTick = ({
  x = 0,
  y = 0,
  maxLineLength = 30,
  payload,
}: TaskNameTickProps) => {
  const lines = splitTaskName(payload?.value ?? "", maxLineLength);
  const firstLineOffset = lines.length === 1 ? 4 : -5;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-12}
        y={firstLineOffset}
        textAnchor="end"
        className="fill-neutral-700 text-[11px] font-bold dark:fill-dark-900"
      >
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={-12} dy={index === 0 ? 0 : 15}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

const SegmentLabel = ({ x, y, width, height, value }: SegmentLabelProps) => {
  if (!value) return null;

  const segmentX = toNumber(x);
  const segmentY = toNumber(y);
  const segmentWidth = toNumber(width);
  const segmentHeight = toNumber(height);
  const label = String(value);
  const estimatedLabelWidth = label.length * 6;
  const availableLabelWidth = Math.max(segmentWidth - 8, 1);
  const shouldCondenseLabel = availableLabelWidth < estimatedLabelWidth;

  return (
    <text
      x={segmentX + segmentWidth / 2}
      y={segmentY + segmentHeight / 2}
      dy="0.35em"
      textAnchor="middle"
      fill="#ffffff"
      fontSize={10}
      fontWeight={800}
      lengthAdjust={shouldCondenseLabel ? "spacingAndGlyphs" : undefined}
      textLength={shouldCondenseLabel ? availableLabelWidth : undefined}
    >
      {label}
    </text>
  );
};

export const TaskProgressChart = ({ data }: TaskProgressChartProps) => {
  const [taskNameAxisWidth, setTaskNameAxisWidth] = useState(250);
  const chartData = useMemo(
    () =>
      data.map((task) => ({
        ...task,
        doneLabel: getTaskProgressLabel(task.doneCount, task.completionRate),
        missedLabel: getTaskProgressLabel(task.missedCount, task.missedRate),
        pendingLabel: getTaskProgressLabel(task.pendingCount, task.pendingRate),
      })),
    [data],
  );
  const chartHeight = getTaskProgressChartHeight(chartData.length);
  const taskNameLineLength = Math.max(10, Math.floor(taskNameAxisWidth / 8));
  const handleResize = useCallback((width: number) => {
    setTaskNameAxisWidth(getTaskNameAxisWidth(width));
  }, []);

  return (
    <div
      className="pointer-events-none w-full"
      aria-label={t`Chi tiết hiệu suất công việc hằng ngày`}
    >
      <ResponsiveContainer
        width="100%"
        height={chartHeight}
        onResize={handleResize}
      >
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
          barCategoryGap={24}
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
            tickFormatter={(value: number) => `${value}%`}
            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="taskName"
            width={taskNameAxisWidth}
            interval={0}
            tick={<TaskNameTick maxLineLength={taskNameLineLength} />}
            axisLine={false}
            tickLine={false}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            height={44}
            wrapperStyle={{
              color: "#64748b",
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          />
          <Bar
            name={t`HOÀN THÀNH`}
            dataKey="completionRate"
            stackId="task-progress"
            fill={CHART_COLORS.done}
            barSize={38}
            radius={[8, 0, 0, 8]}
            activeBar={false}
            isAnimationActive={false}
          >
            <LabelList dataKey="doneLabel" content={<SegmentLabel />} />
          </Bar>
          <Bar
            name={t`BỎ LỠ`}
            dataKey="missedRate"
            stackId="task-progress"
            fill={CHART_COLORS.missed}
            barSize={38}
            activeBar={false}
            isAnimationActive={false}
          >
            <LabelList dataKey="missedLabel" content={<SegmentLabel />} />
          </Bar>
          <Bar
            name={t`CHỜ`}
            dataKey="pendingRate"
            stackId="task-progress"
            fill={CHART_COLORS.pending}
            barSize={38}
            radius={[0, 8, 8, 0]}
            activeBar={false}
            isAnimationActive={false}
          >
            <LabelList dataKey="pendingLabel" content={<SegmentLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
