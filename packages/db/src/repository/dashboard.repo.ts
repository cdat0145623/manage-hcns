import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  boards,
  cardActivities,
  cards,
  cardToWorkspaceMembers,
  lists,
  taskInstances,
  taskMasters,
  workspaceMembers,
} from "@kan/db/schema";
import { parseCalendarDayInZone } from "@kan/shared/utils";

// ================================================================
// KANBAN METRICS
// ================================================================

export const getCardDistributionByBoard = async (
  db: dbClient,
  params: {
    boardPublicId: string;
    selectedUserId: string;
  },
) => {
  const board = await db.query.boards.findFirst({
    columns: { id: true },
    where: eq(boards.publicId, params.boardPublicId),
  });

  if (!board) return null;

  const listsData = await db.query.lists.findMany({
    columns: { id: true, publicId: true, name: true },
    where: and(eq(lists.boardId, board.id), isNull(lists.deletedAt)),
  });

  const listIds = listsData.map((l) => l.id);

  const userCards =
    listIds.length > 0
      ? await db
          .select({
            id: cards.id,
            listId: cards.listId,
          })
          .from(cards)
          .innerJoin(
            cardToWorkspaceMembers,
            eq(cards.id, cardToWorkspaceMembers.cardId),
          )
          .innerJoin(
            workspaceMembers,
            eq(cardToWorkspaceMembers.workspaceMemberId, workspaceMembers.id),
          )
          .where(
            and(
              isNull(cards.deletedAt),
              eq(workspaceMembers.userId, params.selectedUserId),
              inArray(cards.listId, listIds),
            ),
          )
      : [];

  const cardsByList = userCards.reduce(
    (acc, card) => {
      acc[card.listId] = (acc[card.listId] ?? 0) + 1;

      return acc;
    },
    {} as Record<number, number>,
  );

  const totalCards = userCards.length;

  const data = listsData.map((list) => {
    const cardCount = cardsByList[list.id] ?? 0;

    return {
      listId: list.publicId,
      listName: list.name,
      cardCount,
      percentage:
        totalCards > 0 ? Math.round((cardCount / totalCards) * 10000) / 100 : 0,
    };
  });

  return { data, totalCards };
};

export const getKanbanDeadlineRate = async (
  db: dbClient,
  params: {
    boardPublicId: string;
    selectedUserId: string;
  },
) => {
  const board = await db.query.boards.findFirst({
    columns: { id: true },
    where: eq(boards.publicId, params.boardPublicId),
  });

  if (!board) return null;

  const boardLists = await db.query.lists.findMany({
    columns: { id: true },
    where: and(eq(lists.boardId, board.id), isNull(lists.deletedAt)),
  });

  if (boardLists.length === 0) {
    return { onTimeCount: 0, totalCards: 0, rate: 0 };
  }

  const listIds = boardLists.map((l) => l.id);
  const userCards =
    listIds.length > 0
      ? await db
          .select({
            id: cards.id,
            status: cards.status,
            dueDate: cards.dueDate,
          })
          .from(cards)
          .innerJoin(
            cardToWorkspaceMembers,
            eq(cards.id, cardToWorkspaceMembers.cardId),
          )
          .innerJoin(
            workspaceMembers,
            eq(cardToWorkspaceMembers.workspaceMemberId, workspaceMembers.id),
          )
          .where(
            and(
              isNull(cards.deletedAt),
              eq(workspaceMembers.userId, params.selectedUserId),
              inArray(cards.listId, listIds),
            ),
          )
      : [];
  const totalCards = userCards.length;

  if (totalCards === 0) {
    return { onTimeCount: 0, totalCards: 0, rate: 0 };
  }

  const doneCards = userCards.filter((c) => c.status === "done");
  const doneCardIds = doneCards.map((c) => c.id);

  // Batch fetch the earliest status_changed='done' activity for each done card
  const doneActivities =
    doneCardIds.length > 0
      ? await db
          .select({
            cardId: cardActivities.cardId,
            createdAt: cardActivities.createdAt,
          })
          .from(cardActivities)
          .where(
            and(
              inArray(cardActivities.cardId, doneCardIds),
              eq(cardActivities.type, "status_changed"),
              eq(cardActivities.newValue, "done"),
            ),
          )
      : [];

  // Build map: cardId → earliest done activity createdAt
  const firstDoneMap = new Map<number, Date>();
  for (const activity of doneActivities) {
    if (activity.cardId === null) continue;
    const existing = firstDoneMap.get(activity.cardId);
    if (!existing || activity.createdAt < existing) {
      firstDoneMap.set(activity.cardId, activity.createdAt);
    }
  }

  let onTimeCount = 0;
  for (const card of doneCards) {
    if (!card.dueDate) {
      // No due date → on time per spec
      onTimeCount++;
      continue;
    }
    const doneAt = firstDoneMap.get(card.id);
    if (doneAt && doneAt < card.dueDate) {
      onTimeCount++;
    }
  }

  const rate =
    totalCards > 0 ? Math.round((onTimeCount / totalCards) * 10000) / 100 : 0;

  return { onTimeCount, totalCards, rate };
};

// ================================================================
// CALENDAR METRICS
// ================================================================

interface CalendarMetricInstance {
  id: string;
  taskMasterId: string;
  taskMasterName: string | null;
  targetDate: Date | null;
  actualDate: Date | null;
  endDate: Date | null;
  status: "pending" | "done" | "missed";
}

const calendarMetricDateRange = (params: {
  viewMode: "week" | "month" | "year";
  value?: number;
  year: number;
}) => {
  let fromDateKey: string;
  let toDateKey: string;

  if (params.viewMode === "week") {
    const week = params.value ?? 1;
    const jan1 = new Date(Date.UTC(params.year, 0, 1));
    const dayOfWeek = jan1.getUTCDay();
    const diffToMonday =
      dayOfWeek === 1 ? 0 : dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const firstMonday = new Date(Date.UTC(params.year, 0, 1 + diffToMonday));
    const fromUtc = new Date(
      firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000,
    );
    const toUtc = new Date(fromUtc.getTime() + 7 * 24 * 60 * 60 * 1000);
    fromDateKey = fromUtc.toISOString().slice(0, 10);
    toDateKey = toUtc.toISOString().slice(0, 10);
  } else if (params.viewMode === "year") {
    fromDateKey = `${params.year}-01-01`;
    toDateKey = `${params.year + 1}-01-01`;
  } else {
    const month = params.value ?? 1;
    const fromUtc = new Date(Date.UTC(params.year, month - 1, 1));
    const toUtc = new Date(Date.UTC(params.year, month, 1));
    fromDateKey = fromUtc.toISOString().slice(0, 10);
    toDateKey = toUtc.toISOString().slice(0, 10);
  }

  return {
    from: parseCalendarDayInZone(fromDateKey),
    to: parseCalendarDayInZone(toDateKey),
  };
};

export const getCalendarMetrics = async (
  db: dbClient,
  params: {
    selectedUserId: string;
    viewMode: "week" | "month" | "year";
    value?: number;
    year: number;
  },
) => {
  const { from, to } = calendarMetricDateRange(params);
  const allInstances: CalendarMetricInstance[] = await db
    .select({
      id: taskInstances.id,
      taskMasterId: taskInstances.taskMasterId,
      taskMasterName: taskMasters.name,
      targetDate: taskInstances.targetDate,
      actualDate: taskInstances.actualDate,
      endDate: taskInstances.endDate,
      status: taskInstances.status,
    })
    .from(taskInstances)
    .innerJoin(taskMasters, eq(taskInstances.taskMasterId, taskMasters.id))
    .where(
      and(
        eq(taskInstances.userId, params.selectedUserId),
        eq(taskInstances.isDeleted, false),
        gte(taskInstances.targetDate, from),
        lt(taskInstances.targetDate, to),
      ),
    );

  const totalCount = allInstances.length;
  const doneInstances = allInstances.filter((i) => i.status === "done");
  const doneCount = doneInstances.length;

  // ── taskCompletionRate ─────────────────────────────────────────
  const taskCompletionRate = {
    doneCount,
    totalCount,
    rate:
      totalCount > 0 ? Math.round((doneCount / totalCount) * 10000) / 100 : 0,
  };

  // ── deadlineCompletionRate ─────────────────────────────────────
  const calendarOnTimeCount = doneInstances.filter(
    (instance) =>
      instance.actualDate !== null &&
      instance.endDate !== null &&
      instance.actualDate <= instance.endDate,
  ).length;

  const deadlineCompletionRate = {
    onTimeCount: calendarOnTimeCount,
    totalCount,
    rate:
      totalCount > 0
        ? Math.round((calendarOnTimeCount / totalCount) * 10000) / 100
        : 0,
  };

  // ── taskProgressBreakdown ──────────────────────────────────────
  const taskGroupMap = new Map<
    string,
    {
      taskName: string | null;
      doneCount: number;
      missedCount: number;
      pendingCount: number;
      totalCount: number;
    }
  >();

  for (const instance of allInstances) {
    const entry = taskGroupMap.get(instance.taskMasterId) ?? {
      taskName: instance.taskMasterName,
      doneCount: 0,
      missedCount: 0,
      pendingCount: 0,
      totalCount: 0,
    };
    entry.totalCount++;
    if (instance.status === "done") entry.doneCount++;
    else if (instance.status === "missed") entry.missedCount++;
    else entry.pendingCount++;

    taskGroupMap.set(instance.taskMasterId, entry);
  }

  const taskProgressBreakdown = {
    data: Array.from(taskGroupMap.entries()).map(([taskId, group]) => {
      const completionRate =
        group.totalCount > 0
          ? Math.round((group.doneCount / group.totalCount) * 10000) / 100
          : 0;
      const missedRate =
        group.totalCount > 0
          ? Math.round((group.missedCount / group.totalCount) * 10000) / 100
          : 0;
      const pendingRate =
        group.totalCount > 0
          ? Math.max(0, 100 - completionRate - missedRate)
          : 0;

      return {
        taskId,
        taskName: group.taskName ?? taskId,
        doneCount: group.doneCount,
        missedCount: group.missedCount,
        pendingCount: group.pendingCount,
        totalCount: group.totalCount,
        completionRate,
        missedRate,
        pendingRate,
      };
    }),
  };

  return {
    taskCompletionRate,
    deadlineCompletionRate,
    taskProgressBreakdown,
  };
};
