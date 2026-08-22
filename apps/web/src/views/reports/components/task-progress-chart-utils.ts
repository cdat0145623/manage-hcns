const MIN_CHART_HEIGHT = 320;
const CHART_VERTICAL_PADDING = 80;
const TASK_ROW_HEIGHT = 72;

export const getTaskNameAxisWidth = (chartWidth: number) => {
  if (chartWidth < 480) return Math.max(88, Math.floor(chartWidth * 0.35));
  if (chartWidth < 768) return 160;
  return 250;
};

export const getTaskProgressLabel = (count: number, rate: number) =>
  count > 0 ? `${count} (${Math.round(rate)}%)` : "";

export const getTaskProgressChartHeight = (taskCount: number) =>
  Math.max(
    MIN_CHART_HEIGHT,
    taskCount * TASK_ROW_HEIGHT + CHART_VERTICAL_PADDING,
  );

export const splitTaskName = (name: string, maxLineLength: number) => {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const safeLineLength = Math.max(2, maxLineLength);

  if (!normalizedName) return [""];

  const takeLine = (value: string) => {
    if (value.length <= safeLineLength) return [value, ""] as const;

    const candidate = value.slice(0, safeLineLength + 1);
    const wordBoundary = candidate.lastIndexOf(" ");

    if (wordBoundary > 0) {
      return [
        value.slice(0, wordBoundary),
        value.slice(wordBoundary + 1),
      ] as const;
    }

    return [
      value.slice(0, safeLineLength),
      value.slice(safeLineLength),
    ] as const;
  };

  const [firstLine, remainingName] = takeLine(normalizedName);
  if (!remainingName) return [firstLine];

  const [secondLine, truncatedName] = takeLine(remainingName);
  if (!truncatedName) return [firstLine, secondLine];

  return [firstLine, `${secondLine.slice(0, safeLineLength - 1).trimEnd()}…`];
};
