import type { Options } from "rrule";
import * as rrule from "rrule";

import { buildInstantFromAppCalendarDayAndTime } from "./calendarTimezone";

const { RRule } = rrule;

type FreqType = "daily" | "dayOfWeek" | "monthlyDate" | "monthlyDayRank";

interface FreqConfig {
  type: FreqType;

  // Cho dayOfWeek: [0, 1, 2, 3, 4, 5, 6] (0 là Chủ Nhật)
  days?: number[];

  // Cho monthlyDate: [1, 15, 31]
  dates?: number[];

  // Cho monthlyDayRank: 1 (đầu tiên), 2, 3, 4, -1 (cuối cùng)
  rank?: number;
  rankDay?: number; // 0 (CN) -> 6 (Thứ 7)

  startTime: string; // "08:00"
  startDate: Date; // Ngày bắt đầu hiệu lực
}

export const generateRRuleString = (config: FreqConfig): string => {
  const { type, days, dates, rank, rankDay, startDate, startTime } = config;

  const parts = startTime.split(":").map(Number);
  if (parts.length < 2 || parts.some(isNaN)) {
    throw new Error("Định dạng thời gian không hợp lệ. Mong đợi HH:mm");
  }
  const [hour = 0, minute = 0] = parts;

  // TẠO NGÀY BẮT ĐẦU VỚI MÚI GIỜ VIỆT NAM
  // Chúng ta tạo một ngày dựa trên startDate nhưng set đúng giờ/phút
  const dtstart = buildInstantFromAppCalendarDayAndTime(
    startDate,
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  );

  const ruleOptions: Partial<Options> = {
    dtstart: dtstart,
    // TZID giúp rrule hiểu quy tắc lặp dựa trên múi giờ cụ thể
    // (Quan trọng cho việc nhảy giờ mùa hè/đông nếu có, dù VN không có nhưng là chuẩn tốt)
    tzid: "Asia/Ho_Chi_Minh",
  };

  switch (type) {
    case "daily":
      ruleOptions.freq = RRule.DAILY;
      break;

    case "dayOfWeek":
      ruleOptions.freq = RRule.WEEKLY;
      ruleOptions.byweekday = days;
      break;

    case "monthlyDate":
      ruleOptions.freq = RRule.MONTHLY;
      ruleOptions.bymonthday = dates;
      break;

    case "monthlyDayRank":
      ruleOptions.freq = RRule.MONTHLY;
      ruleOptions.byweekday = rankDay;
      ruleOptions.bysetpos = rank;
      break;

    default:
      throw new Error("Invalid frequency type");
  }

  const rule = new RRule(ruleOptions);
  return rule.toString();
};
