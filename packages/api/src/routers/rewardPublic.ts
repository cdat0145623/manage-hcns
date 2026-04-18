import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import type { dbClient } from "@kan/db/client";
import {
  boards,
  cardRewardConfigs,
  cardRewardDeductions,
  cardRewardFinalizations,
  cards,
  cardToWorkspaceMembers,
  lists,
  users,
  workspaceMembers,
  workspaces,
} from "@kan/db/schema";

import type {
  CardMemberPublic,
  RewardDeductionPublic,
  RewardPublicEnriched,
  UserPublicFields,
} from "../utils/rewardPublicMapper";
import { createTRPCRouter, publicProcedure } from "../trpc";
import {
  boardNameForMonth,
  formatMonthYYYYMM,
  mapFinalizationToCore,
  parseCalendarMonthYYYYMM,
  parseMonthFromBoardName,
  parseYearFromWorkspaceName,
  resolvePrimaryCardUser,
} from "../utils/rewardPublicMapper";

async function fetchDeductionsGrouped(
  db: dbClient,
  configIds: number[],
): Promise<Map<number, RewardDeductionPublic[]>> {
  const map = new Map<number, RewardDeductionPublic[]>();
  if (configIds.length === 0) return map;
  const rows = await db
    .select({
      configId: cardRewardDeductions.configId,
      reason: cardRewardDeductions.reason,
      unitType: cardRewardDeductions.unitType,
      value: cardRewardDeductions.value,
      displayOrder: cardRewardDeductions.displayOrder,
    })
    .from(cardRewardDeductions)
    .where(inArray(cardRewardDeductions.configId, configIds));

  for (const row of rows) {
    const list = map.get(row.configId) ?? [];
    list.push({
      reason: row.reason,
      unit_type: row.unitType as "percent" | "vnd",
      value: Number(row.value),
      display_order: row.displayOrder,
    });
    map.set(row.configId, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.display_order - b.display_order);
  }
  return map;
}

function dedupeMembersByUserId(
  members: CardMemberPublic[],
): CardMemberPublic[] {
  const seen = new Set<string>();
  const out: CardMemberPublic[] = [];
  for (const m of members) {
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    out.push(m);
  }
  return out;
}

async function fetchCardMembersGrouped(
  db: dbClient,
  cardIds: number[],
): Promise<Map<number, CardMemberPublic[]>> {
  const map = new Map<number, CardMemberPublic[]>();
  if (cardIds.length === 0) return map;
  const rows = await db
    .select({
      cardId: cardToWorkspaceMembers.cardId,
      userId: users.id,
      userFullName: users.name,
      userLogin: users.username,
    })
    .from(cardToWorkspaceMembers)
    .innerJoin(
      workspaceMembers,
      eq(cardToWorkspaceMembers.workspaceMemberId, workspaceMembers.id),
    )
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        inArray(cardToWorkspaceMembers.cardId, cardIds),
        isNull(workspaceMembers.deletedAt),
        isNotNull(workspaceMembers.userId),
      ),
    );

  for (const row of rows) {
    const list = map.get(row.cardId) ?? [];
    list.push({
      user_id: row.userId,
      user_full_name: row.userFullName,
      user_name: row.userLogin,
    });
    map.set(row.cardId, list);
  }
  for (const [id, list] of map) {
    map.set(id, dedupeMembersByUserId(list));
  }
  return map;
}

async function fetchUserFieldsByIds(
  db: dbClient,
  userIds: string[],
): Promise<Map<string, UserPublicFields>> {
  const map = new Map<string, UserPublicFields>();
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return map;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
    })
    .from(users)
    .where(inArray(users.id, unique));
  for (const row of rows) {
    map.set(row.id, {
      user_full_name: row.name,
      user_name: row.username,
    });
  }
  return map;
}

function enrichMonthFromBoard(
  boardName: string | null,
  workspaceName: string | null,
): string | null {
  if (!boardName || !workspaceName) return null;
  const m = parseMonthFromBoardName(boardName);
  if (m == null) return null;
  const y = parseYearFromWorkspaceName(workspaceName);
  if (y == null) return null;
  return formatMonthYYYYMM(y, m);
}

/** Workspace đại diện năm: ưu tiên `name` đúng bằng `YYYY`, không thì khớp duy nhất qua parse năm. */
async function findWorkspaceByCalendarYear(
  db: dbClient,
  year: number,
): Promise<{ id: number; name: string }> {
  const exact = await db.query.workspaces.findFirst({
    columns: { id: true, name: true },
    where: and(eq(workspaces.name, String(year)), isNull(workspaces.deletedAt)),
  });
  if (exact) return exact;

  const candidates = await db.query.workspaces.findMany({
    columns: { id: true, name: true },
    where: isNull(workspaces.deletedAt),
  });
  const matches = candidates.filter(
    (w) => parseYearFromWorkspaceName(w.name) === year,
  );
  if (matches.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No workspace found for calendar year ${year}`,
    });
  }
  if (matches.length > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Multiple workspaces match calendar year ${year}; give workspace names a unique year`,
    });
  }
  return matches[0]!;
}

const listByCalendarMonthInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
});

async function queryRewardsByCalendarMonth(opts: {
  ctx: { db: dbClient };
  input: z.infer<typeof listByCalendarMonthInput>;
}): Promise<RewardPublicEnriched[]> {
  const { ctx, input } = opts;
  const { year, month1to12 } = parseCalendarMonthYYYYMM(input.month);
  const monthLabel = formatMonthYYYYMM(year, month1to12);
  const ws = await findWorkspaceByCalendarYear(ctx.db, year);
  const boardTitle = boardNameForMonth(month1to12);

  const board = await ctx.db.query.boards.findFirst({
    columns: { id: true, name: true },
    where: and(
      eq(boards.workspaceId, ws.id),
      eq(boards.name, boardTitle),
      isNull(boards.deletedAt),
    ),
  });

  if (!board) {
    return [];
  }

  const boardLists = await ctx.db.query.lists.findMany({
    columns: { id: true },
    where: and(eq(lists.boardId, board.id), isNull(lists.deletedAt)),
  });
  const listIds = boardLists.map((l) => l.id);
  if (listIds.length === 0) {
    return [];
  }

  const results = await ctx.db
    .select({
      config_id: cardRewardConfigs.id,
      card_id: cards.publicId,
      card_internal_id: cards.id,
      target_user_id: cards.targetUser,
      type: cardRewardConfigs.rewardType,
      bonus_amount: cardRewardConfigs.bonusAmount,
      approval_status: cardRewardConfigs.approvalStatus,
      final_percent: cardRewardFinalizations.completionPercent,
      suggestedAmount: cardRewardFinalizations.suggestedAmount,
      final_amount: cardRewardFinalizations.finalAmount,
      final_note: cardRewardFinalizations.finalNote,
      completed_at: cardRewardFinalizations.finalizedAt,
    })
    .from(cardRewardConfigs)
    .innerJoin(cards, eq(cardRewardConfigs.cardId, cards.id))
    .leftJoin(
      cardRewardFinalizations,
      eq(cardRewardConfigs.id, cardRewardFinalizations.configId),
    )
    .where(
      and(
        isNotNull(cardRewardConfigs.cardId),
        isNull(cards.deletedAt),
        inArray(cards.listId, listIds),
      ),
    );

  const configIds = results.map((r) => r.config_id);
  const dedMap = await fetchDeductionsGrouped(ctx.db, configIds);

  const cardIds = [...new Set(results.map((r) => r.card_internal_id))];
  const memberMap = await fetchCardMembersGrouped(ctx.db, cardIds);
  const targetIds = results
    .map((r) => r.target_user_id)
    .filter((id): id is string => id != null);
  const targetFieldsMap = await fetchUserFieldsByIds(ctx.db, targetIds);

  return results.map((r) => {
    const fin = mapFinalizationToCore(
      r.bonus_amount,
      r.final_percent,
      r.suggestedAmount,
      r.final_amount,
      r.final_note,
      r.completed_at,
    );
    const members = memberMap.get(r.card_internal_id) ?? [];
    const primary = resolvePrimaryCardUser(
      r.target_user_id,
      members,
      targetFieldsMap,
    );
    return {
      card_id: r.card_id,
      type: r.type,
      ...fin,
      month: monthLabel,
      board_name: board.name,
      approval_status: r.approval_status,
      deductions: dedMap.get(r.config_id) ?? [],
      members,
      user_id: primary.user_id,
      user_full_name: primary.user_full_name,
      user_name: primary.user_name,
    };
  });
}

export const rewardPublicRouter = createTRPCRouter({
  /** OpenAPI GET /rewards/by-month — dùng cho REST /api/v1 */
  listByCalendarMonth: publicProcedure
    .meta({
      openapi: {
        summary:
          "List reward configs for a calendar month (maps workspace by year + board Tháng N)",
        method: "GET",
        path: "/rewards/by-month",
        tags: ["Rewards"],
      },
    })
    .input(listByCalendarMonthInput)
    .query(queryRewardsByCalendarMonth),

  /** Alias cùng input `{ month: YYYY-MM }` — tránh lỗi client cũ / tên procedure khác nhau */
  listByWorkspaceMonth: publicProcedure
    .input(listByCalendarMonthInput)
    .query(queryRewardsByCalendarMonth),

  completed: publicProcedure
    .meta({
      openapi: {
        summary: "Get completed reward evaluations",
        method: "GET",
        path: "/rewards/completed",
        tags: ["Rewards"],
      },
    })
    .input(z.void())
    .query(async ({ ctx }): Promise<RewardPublicEnriched[]> => {
      const results = await ctx.db
        .select({
          config_id: cardRewardConfigs.id,
          card_id: cards.publicId,
          card_internal_id: cards.id,
          target_user_id: cards.targetUser,
          type: cardRewardConfigs.rewardType,
          bonus_amount: cardRewardConfigs.bonusAmount,
          approval_status: cardRewardConfigs.approvalStatus,
          final_percent: cardRewardFinalizations.completionPercent,
          suggestedAmount: cardRewardFinalizations.suggestedAmount,
          final_amount: cardRewardFinalizations.finalAmount,
          final_note: cardRewardFinalizations.finalNote,
          completed_at: cardRewardFinalizations.finalizedAt,
          board_name: boards.name,
          workspace_name: workspaces.name,
        })
        .from(cardRewardConfigs)
        .innerJoin(
          cardRewardFinalizations,
          eq(cardRewardConfigs.id, cardRewardFinalizations.configId),
        )
        .innerJoin(cards, eq(cardRewardConfigs.cardId, cards.id))
        .innerJoin(lists, eq(cards.listId, lists.id))
        .innerJoin(boards, eq(lists.boardId, boards.id))
        .innerJoin(workspaces, eq(boards.workspaceId, workspaces.id))
        .where(
          and(
            eq(cardRewardConfigs.approvalStatus, "completed"),
            isNull(cards.deletedAt),
            isNull(boards.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        );

      const configIds = results.map((r) => r.config_id);
      const dedMap = await fetchDeductionsGrouped(ctx.db, configIds);

      const cardIds = [...new Set(results.map((r) => r.card_internal_id))];
      const memberMap = await fetchCardMembersGrouped(ctx.db, cardIds);
      const targetIds = results
        .map((r) => r.target_user_id)
        .filter((id): id is string => id != null);
      const targetFieldsMap = await fetchUserFieldsByIds(ctx.db, targetIds);

      return results.map((r) => {
        const fin = mapFinalizationToCore(
          r.bonus_amount,
          r.final_percent,
          r.suggestedAmount,
          r.final_amount,
          r.final_note,
          r.completed_at,
        );
        const members = memberMap.get(r.card_internal_id) ?? [];
        const primary = resolvePrimaryCardUser(
          r.target_user_id,
          members,
          targetFieldsMap,
        );
        return {
          card_id: r.card_id,
          type: r.type,
          ...fin,
          month: enrichMonthFromBoard(r.board_name, r.workspace_name),
          board_name: r.board_name,
          approval_status: r.approval_status,
          deductions: dedMap.get(r.config_id) ?? [],
          members,
          user_id: primary.user_id,
          user_full_name: primary.user_full_name,
          user_name: primary.user_name,
        };
      });
    }),

  getByCardId: publicProcedure
    .meta({
      openapi: {
        summary: "Get reward evaluation result for a card",
        method: "GET",
        path: "/cards/{id}/reward-result",
        tags: ["Rewards"],
      },
    })
    .input(z.object({ cardPublicId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<RewardPublicEnriched | null> => {
      const result = await ctx.db
        .select({
          config_id: cardRewardConfigs.id,
          card_id: cards.publicId,
          card_internal_id: cards.id,
          target_user_id: cards.targetUser,
          type: cardRewardConfigs.rewardType,
          bonus_amount: cardRewardConfigs.bonusAmount,
          approval_status: cardRewardConfigs.approvalStatus,
          final_percent: cardRewardFinalizations.completionPercent,
          suggestedAmount: cardRewardFinalizations.suggestedAmount,
          final_amount: cardRewardFinalizations.finalAmount,
          final_note: cardRewardFinalizations.finalNote,
          completed_at: cardRewardFinalizations.finalizedAt,
          board_name: boards.name,
          workspace_name: workspaces.name,
        })
        .from(cardRewardConfigs)
        .innerJoin(
          cardRewardFinalizations,
          eq(cardRewardConfigs.id, cardRewardFinalizations.configId),
        )
        .innerJoin(cards, eq(cardRewardConfigs.cardId, cards.id))
        .innerJoin(lists, eq(cards.listId, lists.id))
        .innerJoin(boards, eq(lists.boardId, boards.id))
        .innerJoin(workspaces, eq(boards.workspaceId, workspaces.id))
        .where(
          and(
            eq(cards.publicId, input.cardPublicId),
            eq(cardRewardConfigs.approvalStatus, "completed"),
            isNull(cards.deletedAt),
            isNull(boards.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1);

      const r = result[0];
      if (!r) return null;

      const dedMap = await fetchDeductionsGrouped(ctx.db, [r.config_id]);
      const fin = mapFinalizationToCore(
        r.bonus_amount,
        r.final_percent,
        r.suggestedAmount,
        r.final_amount,
        r.final_note,
        r.completed_at,
      );

      const memberMap = await fetchCardMembersGrouped(ctx.db, [
        r.card_internal_id,
      ]);
      const members = memberMap.get(r.card_internal_id) ?? [];
      const targetFieldsMap = await fetchUserFieldsByIds(
        ctx.db,
        r.target_user_id ? [r.target_user_id] : [],
      );
      const primary = resolvePrimaryCardUser(
        r.target_user_id,
        members,
        targetFieldsMap,
      );

      return {
        card_id: r.card_id,
        type: r.type,
        ...fin,
        month: enrichMonthFromBoard(r.board_name, r.workspace_name),
        board_name: r.board_name,
        approval_status: r.approval_status,
        deductions: dedMap.get(r.config_id) ?? [],
        members,
        user_id: primary.user_id,
        user_full_name: primary.user_full_name,
        user_name: primary.user_name,
      };
    }),
});
