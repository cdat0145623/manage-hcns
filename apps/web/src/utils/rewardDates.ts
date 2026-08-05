import { vi } from "date-fns/locale";

import { formatInAppCalendarZone } from "@kan/shared/utils";

const rewardDateLocale = vi;

/** Hiển thị ngày ngắn trong card thưởng (UTC+7) — ví dụ: 1 thg 4 */
export function formatRewardDayMonth(date: Date | string): string {
  return formatInAppCalendarZone(date, "d MMM", { locale: rewardDateLocale });
}

/** Ngày có năm (UTC+7) — ví dụ: 20 thg 4 2026 */
export function formatRewardDayMonthYear(date: Date | string): string {
  return formatInAppCalendarZone(date, "d MMM yyyy", {
    locale: rewardDateLocale,
  });
}
