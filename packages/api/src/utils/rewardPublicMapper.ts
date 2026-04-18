import { TRPCError } from "@trpc/server";

/** Parse 4-digit year from workspace name (exact `2026` or first `\d{4}` in string). */
export function parseYearFromWorkspaceName(name: string): number | null {
  const trimmed = name.trim();
  if (/^\d{4}$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  const m = trimmed.match(/(\d{4})/);
  if (m) {
    const y = Number.parseInt(m[1]!, 10);
    if (y >= 1000 && y <= 9999) return y;
  }
  return null;
}

export function resolveCalendarYear(
  workspaceName: string,
  yearOverride: number | undefined,
): number {
  if (yearOverride != null) {
    if (yearOverride < 1000 || yearOverride > 9999) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "year must be a 4-digit year",
      });
    }
    return yearOverride;
  }
  const parsed = parseYearFromWorkspaceName(workspaceName);
  if (parsed == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Could not infer year from workspace name; pass year explicitly (workspace name should contain a 4-digit year).",
    });
  }
  return parsed;
}

export function formatMonthYYYYMM(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

/** Parse `YYYY-MM` (e.g. `2026-04`) for public calendar-month APIs. */
export function parseCalendarMonthYYYYMM(s: string): {
  year: number;
  month1to12: number;
} {
  const m = s.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "month must be YYYY-MM",
    });
  }
  const year = Number.parseInt(m[1]!, 10);
  const month1to12 = Number.parseInt(m[2]!, 10);
  if (month1to12 < 1 || month1to12 > 12) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid month in YYYY-MM (use 01–12)",
    });
  }
  return { year, month1to12 };
}

/** Matches boards named `Tháng 1` … `Tháng 12` in UI. */
export function boardNameForMonth(month1to12: number): string {
  return `Tháng ${month1to12}`;
}

/** Inverse of boardNameForMonth for enriching completed rows. */
export function parseMonthFromBoardName(boardName: string): number | null {
  const m = boardName.trim().match(/^Tháng\s+(\d{1,2})$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  if (n >= 1 && n <= 12) return n;
  return null;
}

export type RewardDeductionPublic = {
  reason: string;
  unit_type: "percent" | "vnd";
  value: number;
  display_order: number;
};

export type RewardPublicCore = {
  card_id: string;
  type: string;
  bonus_amount: number;
  final_percent: number | null;
  total_deduction: number | null;
  final_amount: number | null;
  final_note: string | null;
  completed_at: Date | null;
};

export type CardMemberPublic = {
  user_id: string;
  user_full_name: string | null;
  /** `user.username` — đăng nhập / handle */
  user_name: string | null;
};

/** Map từ `fetchUserFieldsByIds` khi targetUser không nằm trong members. */
export type UserPublicFields = {
  user_full_name: string | null;
  user_name: string | null;
};

/** Ưu tiên targetUser; tên lấy từ members hoặc map từ DB. */
export function resolvePrimaryCardUser(
  targetUserId: string | null,
  members: CardMemberPublic[],
  targetFromDb: Map<string, UserPublicFields>,
): {
  user_id: string | null;
  user_full_name: string | null;
  user_name: string | null;
} {
  if (targetUserId) {
    const fromMember = members.find((m) => m.user_id === targetUserId);
    const fromDb = targetFromDb.get(targetUserId);
    return {
      user_id: targetUserId,
      user_full_name:
        fromMember?.user_full_name ?? fromDb?.user_full_name ?? null,
      user_name: fromMember?.user_name ?? fromDb?.user_name ?? null,
    };
  }
  const first = members[0];
  return {
    user_id: first?.user_id ?? null,
    user_full_name: first?.user_full_name ?? null,
    user_name: first?.user_name ?? null,
  };
}

export type RewardPublicEnriched = RewardPublicCore & {
  month: string | null;
  board_name: string | null;
  approval_status: string;
  deductions: RewardDeductionPublic[];
  /** Thành viên được gán trên thẻ (workspace members → user) */
  members: CardMemberPublic[];
  /**
   * Người thể hiện chính: `cards.targetUser` nếu có, không thì thành viên đầu trong `members`.
   */
  user_id: string | null;
  user_full_name: string | null;
  user_name: string | null;
};

export function mapFinalizationToCore(
  bonusRaw: string | null,
  finalPercentRaw: string | null,
  suggestedRaw: string | null,
  finalRaw: string | null,
  finalNote: string | null,
  completedAt: Date | null,
): Pick<
  RewardPublicCore,
  | "bonus_amount"
  | "final_percent"
  | "total_deduction"
  | "final_amount"
  | "final_note"
  | "completed_at"
> {
  const bonus = Number(bonusRaw || 0);
  const hasFinal =
    finalPercentRaw != null &&
    suggestedRaw != null &&
    finalRaw != null &&
    completedAt != null;
  if (!hasFinal) {
    return {
      bonus_amount: bonus,
      final_percent: null,
      total_deduction: null,
      final_amount: null,
      final_note: finalNote,
      completed_at: completedAt,
    };
  }
  const suggested = Number(suggestedRaw || 0);
  const final = Number(finalRaw || 0);
  return {
    bonus_amount: bonus,
    final_percent: Number(finalPercentRaw),
    total_deduction: suggested - final,
    final_amount: final,
    final_note: finalNote,
    completed_at: completedAt,
  };
}
