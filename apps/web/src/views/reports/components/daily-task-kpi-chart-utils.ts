const DAILY_TASK_KPI_CHART_MIN_HEIGHT = 320;
const DAILY_TASK_KPI_CHART_ROW_HEIGHT = 44;
const DAILY_TASK_KPI_CHART_VERTICAL_PADDING = 32;
const DAILY_TASK_KPI_LABEL_MAX_LENGTH = 34;

export function getDailyTaskKpiChartHeight(taskCount: number) {
  const rowCount = Math.max(0, taskCount);
  return Math.max(
    DAILY_TASK_KPI_CHART_MIN_HEIGHT,
    rowCount * DAILY_TASK_KPI_CHART_ROW_HEIGHT +
      DAILY_TASK_KPI_CHART_VERTICAL_PADDING,
  );
}

export function truncateDailyTaskKpiLabel(label: string) {
  if (label.length <= DAILY_TASK_KPI_LABEL_MAX_LENGTH) return label;
  return `${label.slice(0, DAILY_TASK_KPI_LABEL_MAX_LENGTH - 1).trimEnd()}…`;
}
