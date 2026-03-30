import { RRule, Weekday } from 'rrule';

type FreqType = 'dayOfWeek' | 'monthlyDate' | 'monthlyDayRank';

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
  startDate: Date;   // Ngày bắt đầu hiệu lực
}

export const generateRRuleString = (config: FreqConfig): string => {
  const { type, days, dates, rank, rankDay, startDate, startTime } = config;
  
  // Tách giờ phút từ startTime "08:30"
  const parts = startTime.split(':').map(Number);

    if (parts.length < 2 || parts.some(isNaN)) {
        throw new Error("Định dạng thời gian không hợp lệ. Mong đợi HH:mm");
    }

    const [hour = 0, minute = 0] = parts;
  const dtstart = new Date(startDate);
  dtstart.setHours(hour, minute, 0);

  let rule: RRule;

  switch (type) {
    case 'dayOfWeek':
      rule = new RRule({
        freq: RRule.WEEKLY,
        byweekday: days, // mảng số 0-6
        dtstart
      });
      break;

    case 'monthlyDate':
      rule = new RRule({
        freq: RRule.MONTHLY,
        bymonthday: dates,
        dtstart
      });
      break;

    case 'monthlyDayRank':
      rule = new RRule({
        freq: RRule.MONTHLY,
        byweekday: rankDay, // ví dụ: 1 (Thứ 2)
        bysetpos: rank,     // ví dụ: 1 (Đầu tiên)
        dtstart
      });
      break;
      
    default:
      throw new Error("Invalid frequency type");
  }

  return rule.toString();
};