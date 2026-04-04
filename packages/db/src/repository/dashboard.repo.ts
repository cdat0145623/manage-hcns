import { and, eq, inArray, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  boards,
  cardActivities,
  cards,
  cardToWorkspaceMembers,
  lists,
  workspaceMembers,
} from "@kan/db/schema";

import { generateVirtualTaskInstances } from "./taskInstance.repo";

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

interface MergedInstance {
  id: string;
  userId: string;
  taskMasterId: string;
  taskMasterName: string | null;
  targetDate: Date | null;
  status: "pending" | "done" | "missed";
}

export const getCalendarMetrics = async (
  db: dbClient,
  params: {
    selectedUserId: string;
    viewMode: "week" | "month" | "year";
    value?: number;
    year: number;
  },
) => {
  const normalizeToMidnight = (date: Date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  };

  let from: Date;
  let to: Date;

  if (params.viewMode === "week") {
    const week = params.value ?? 1;
    // Week calculation: start from Jan 1st and add weeks.
    // To make it simpler and consistent across JS:
    const jan1 = new Date(Date.UTC(params.year, 0, 1));
    const dayOfWeek = jan1.getUTCDay();
    const diffToMonday =
      dayOfWeek === 1 ? 0 : dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const firstMonday = new Date(Date.UTC(params.year, 0, 1 + diffToMonday));

    from = new Date(
      firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000,
    );
    to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  } else if (params.viewMode === "year") {
    from = new Date(Date.UTC(params.year, 0, 1));
    to = new Date(Date.UTC(params.year, 11, 31, 23, 59, 59, 999));
  } else {
    // Default: month
    const month = params.value ?? 1;
    from = new Date(Date.UTC(params.year, month - 1, 1));
    to = new Date(Date.UTC(params.year, month, 0, 23, 59, 59, 999));
  }

  // Get all task masters active in range for the selected user
  const taskMastersData = await db.query.taskMasters.findMany({
    where: (t, { and: _and, lt, gte, eq: _eq }) =>
      _and(
        lt(t.startDate, to),
        gte(t.endDate, from),
        _eq(t.targetUser, params.selectedUserId),
        _eq(t.isDeleted, false),
      ),
    with: { frequence: true },
  });

  // Generate virtual instances and merge with actual DB instances
  const allInstances: MergedInstance[] = [];

  for (const taskMaster of taskMastersData) {
    try {
      const freq = taskMaster.frequence as
        | { rruleString: string; dtStart: Date | null }
        | undefined
        | null;

      if (!freq?.rruleString || !freq.dtStart) continue;

      const effectiveFrom =
        from > taskMaster.startDate ? from : taskMaster.startDate;
      const effectiveTo = to > taskMaster.endDate ? taskMaster.endDate : to;

      const virtualInstances = await generateVirtualTaskInstances({
        userId: taskMaster.targetUser,
        taskMasterId: taskMaster.id,
        rruleString: freq.rruleString,
        startDate: taskMaster.startDate,
        from: effectiveFrom,
        to: effectiveTo,
      });

      if (virtualInstances.length === 0) continue;

      // Fetch actual DB instances for this task master in range
      const actualInstances = await db.query.taskInstances.findMany({
        where: (t, { and: _and, lt, gte, eq: _eq }) =>
          _and(
            lt(t.targetDate, effectiveTo),
            gte(t.targetDate, effectiveFrom),
            _eq(t.taskMasterId, taskMaster.id),
            _eq(t.isDeleted, false),
          ),
      });

      const actualMap = new Map(
        actualInstances.map((ti) => [
          normalizeToMidnight(ti.targetDate ?? new Date(0)),
          ti,
        ]),
      );

      const matchedActualIds = new Set<string>();

      for (const virt of virtualInstances) {
        const actual = actualMap.get(normalizeToMidnight(virt.targetDate));
        if (actual) {
          matchedActualIds.add(actual.id);
        }

        allInstances.push({
          id: actual ? actual.id : virt.id,
          userId: taskMaster.targetUser,
          taskMasterId: taskMaster.id,
          taskMasterName: taskMaster.name ?? null,
          targetDate: virt.targetDate,
          status: actual ? actual.status : ("pending" as const),
        });
      }

      // Add actual instances that didn't match a virtual slot (e.g. ad-hoc or rule changed)
      for (const actual of actualInstances) {
        if (!matchedActualIds.has(actual.id)) {
          allInstances.push({
            id: actual.id,
            userId: taskMaster.targetUser,
            taskMasterId: taskMaster.id,
            taskMasterName: taskMaster.name ?? null,
            targetDate: actual.targetDate,
            status: actual.status,
          });
        }
      }
    } catch {
      // Skip task masters with bad rrule config
    }
  }

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
  // Only actual (non-virtual) instances can have activity records
  const actualDoneInstanceIds = doneInstances
    .filter((i) => !i.id.startsWith("virtual-"))
    .map((i) => i.id);

  const doneInstanceActivities =
    actualDoneInstanceIds.length > 0
      ? await db
          .select({
            taskInstanceId: cardActivities.taskInstanceId,
            createdAt: cardActivities.createdAt,
          })
          .from(cardActivities)
          .where(
            and(
              inArray(cardActivities.taskInstanceId, actualDoneInstanceIds),
              eq(cardActivities.type, "status_changed"),
              eq(cardActivities.newValue, "done"),
            ),
          )
      : [];

  // Build map: instanceId → earliest done activity createdAt
  const firstDoneActivityMap = new Map<string, Date>();
  for (const activity of doneInstanceActivities) {
    if (!activity.taskInstanceId) continue;
    const existing = firstDoneActivityMap.get(activity.taskInstanceId);
    if (!existing || activity.createdAt < existing) {
      firstDoneActivityMap.set(activity.taskInstanceId, activity.createdAt);
    }
  }

  let calendarOnTimeCount = 0;
  for (const instance of doneInstances) {
    if (instance.id.startsWith("virtual-")) continue; // virtual + done is an edge case

    if (!instance.targetDate) {
      calendarOnTimeCount++;
      continue;
    }

    const doneAt = firstDoneActivityMap.get(instance.id);
    if (doneAt && doneAt < instance.targetDate) {
      calendarOnTimeCount++;
    }
  }

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
