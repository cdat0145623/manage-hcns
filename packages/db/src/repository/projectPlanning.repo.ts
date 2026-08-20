import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  cards,
  lists,
  projectBoardSettings,
  projectCardPlanning,
  projectCycleCards,
  projectCycles,
  projectListSettings,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

const toEstimateNumber = (value: string | null) =>
  value == null ? null : Number(value);

export const getSettings = async (db: dbClient, boardId: number) => {
  const settings = await db.query.projectBoardSettings.findFirst({
    columns: { workflowType: true, estimationType: true, enableCycles: true },
    where: eq(projectBoardSettings.boardId, boardId),
  });

  return (
    settings ?? {
      workflowType: "general" as const,
      estimationType: "none" as const,
      enableCycles: false,
    }
  );
};

export const updateSettings = async (
  db: dbClient,
  input: {
    boardId: number;
    workflowType: "general" | "scrum";
    estimationType: "none" | "story_points" | "hours";
    enableCycles: boolean;
  },
) => {
  if (input.workflowType === "scrum" && !input.enableCycles) {
    throw new Error("Scrum workflow requires cycles to be enabled");
  }

  const [settings] = await db
    .insert(projectBoardSettings)
    .values({
      boardId: input.boardId,
      workflowType: input.workflowType,
      estimationType: input.estimationType,
      enableCycles: input.enableCycles,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: projectBoardSettings.boardId,
      set: {
        workflowType: input.workflowType,
        estimationType: input.estimationType,
        enableCycles: input.enableCycles,
        updatedAt: new Date(),
      },
    })
    .returning({
      workflowType: projectBoardSettings.workflowType,
      estimationType: projectBoardSettings.estimationType,
      enableCycles: projectBoardSettings.enableCycles,
    });

  return settings;
};

export const getCycles = async (db: dbClient, boardId: number) =>
  db
    .select({
      publicId: projectCycles.publicId,
      name: projectCycles.name,
      goal: projectCycles.goal,
      startsAt: projectCycles.startsAt,
      endsAt: projectCycles.endsAt,
      status: projectCycles.status,
      completedAt: projectCycles.completedAt,
    })
    .from(projectCycles)
    .where(eq(projectCycles.boardId, boardId))
    .orderBy(desc(projectCycles.startsAt), asc(projectCycles.createdAt));

export const getListSettings = async (db: dbClient, listIds: number[]) => {
  if (listIds.length === 0) return new Map<number, boolean>();

  const rows = await db
    .select({
      listId: projectListSettings.listId,
      isCompletionColumn: projectListSettings.isCompletionColumn,
    })
    .from(projectListSettings)
    .where(inArray(projectListSettings.listId, listIds));

  return new Map(rows.map((row) => [row.listId, row.isCompletionColumn]));
};

export const getCompletionListId = async (db: dbClient, boardId: number) => {
  const [row] = await db
    .select({ listId: lists.id })
    .from(lists)
    .innerJoin(projectListSettings, eq(projectListSettings.listId, lists.id))
    .where(
      and(
        eq(lists.boardId, boardId),
        isNull(lists.deletedAt),
        eq(projectListSettings.isCompletionColumn, true),
      ),
    )
    .limit(1);

  return row?.listId ?? null;
};

export const getCardPlanning = async (db: dbClient, cardIds: number[]) => {
  if (cardIds.length === 0)
    return new Map<
      number,
      {
        cyclePublicId: string | null;
        estimateValue: number | null;
      }
    >();

  const rows = await db
    .select({
      cardId: projectCardPlanning.cardId,
      cyclePublicId: projectCycles.publicId,
      estimateValue: projectCardPlanning.estimateValue,
    })
    .from(projectCardPlanning)
    .leftJoin(projectCycles, eq(projectCardPlanning.cycleId, projectCycles.id))
    .where(inArray(projectCardPlanning.cardId, cardIds));

  return new Map(
    rows.map((row) => [
      row.cardId,
      {
        cyclePublicId: row.cyclePublicId,
        estimateValue: toEstimateNumber(row.estimateValue),
      },
    ]),
  );
};

export const createCycle = async (
  db: dbClient,
  input: {
    boardId: number;
    name: string;
    goal?: string;
    startsAt?: Date;
    endsAt?: Date;
    createdBy: string;
  },
) => {
  const [cycle] = await db
    .insert(projectCycles)
    .values({
      publicId: generateUID(),
      boardId: input.boardId,
      name: input.name,
      goal: input.goal,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdBy: input.createdBy,
    })
    .returning({ publicId: projectCycles.publicId });

  if (!cycle) throw new Error("Unable to create project cycle");
  return cycle;
};

export const getCycleContext = async (
  db: dbClient,
  boardId: number,
  cyclePublicId: string,
) =>
  db.query.projectCycles.findFirst({
    columns: { id: true, publicId: true, boardId: true, status: true },
    where: and(
      eq(projectCycles.boardId, boardId),
      eq(projectCycles.publicId, cyclePublicId),
    ),
  });

export const updateCycle = async (
  db: dbClient,
  input: {
    boardId: number;
    cyclePublicId: string;
    name?: string;
    goal?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
  },
) => {
  const [cycle] = await db
    .update(projectCycles)
    .set({
      name: input.name,
      goal: input.goal,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectCycles.boardId, input.boardId),
        eq(projectCycles.publicId, input.cyclePublicId),
        eq(projectCycles.status, "planned"),
      ),
    )
    .returning({ publicId: projectCycles.publicId });

  return cycle;
};

export const startCycle = async (
  db: dbClient,
  input: { boardId: number; cyclePublicId: string },
) =>
  db.transaction(async (tx) => {
    const activeCycle = await tx.query.projectCycles.findFirst({
      columns: { publicId: true },
      where: and(
        eq(projectCycles.boardId, input.boardId),
        eq(projectCycles.status, "active"),
      ),
    });
    if (activeCycle && activeCycle.publicId !== input.cyclePublicId) {
      throw new Error("Only one project cycle can be active at a time");
    }

    const [cycle] = await tx
      .update(projectCycles)
      .set({ status: "active", updatedAt: new Date() })
      .where(
        and(
          eq(projectCycles.boardId, input.boardId),
          eq(projectCycles.publicId, input.cyclePublicId),
          eq(projectCycles.status, "planned"),
        ),
      )
      .returning({ publicId: projectCycles.publicId });
    return cycle;
  });

export const completeCycle = async (
  db: dbClient,
  input: { boardId: number; cyclePublicId: string },
) =>
  db.transaction(async (tx) => {
    const cycle = await tx.query.projectCycles.findFirst({
      columns: { id: true },
      where: and(
        eq(projectCycles.boardId, input.boardId),
        eq(projectCycles.publicId, input.cyclePublicId),
        eq(projectCycles.status, "active"),
      ),
    });
    if (!cycle) return undefined;

    const now = new Date();
    const completedCards = await tx
      .select({ id: projectCycleCards.id })
      .from(projectCycleCards)
      .innerJoin(cards, eq(projectCycleCards.cardId, cards.id))
      .innerJoin(lists, eq(cards.listId, lists.id))
      .innerJoin(projectListSettings, eq(projectListSettings.listId, lists.id))
      .where(
        and(
          eq(projectCycleCards.cycleId, cycle.id),
          isNull(projectCycleCards.removedAt),
          isNull(cards.deletedAt),
          eq(projectListSettings.isCompletionColumn, true),
        ),
      );
    if (completedCards.length > 0) {
      await tx
        .update(projectCycleCards)
        .set({ completedAt: now })
        .where(
          inArray(
            projectCycleCards.id,
            completedCards.map((card) => card.id),
          ),
        );
    }

    await tx
      .update(projectCardPlanning)
      .set({ cycleId: null, updatedAt: now })
      .where(eq(projectCardPlanning.cycleId, cycle.id));

    await tx
      .update(projectCycleCards)
      .set({ removedAt: now })
      .where(
        and(
          eq(projectCycleCards.cycleId, cycle.id),
          isNull(projectCycleCards.removedAt),
        ),
      );

    const [updated] = await tx
      .update(projectCycles)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(eq(projectCycles.id, cycle.id))
      .returning({ publicId: projectCycles.publicId });
    return updated;
  });

export const setListCompletion = async (
  db: dbClient,
  input: { boardId: number; listId: number; isCompletionColumn: boolean },
) =>
  db.transaction(async (tx) => {
    if (input.isCompletionColumn) {
      const boardLists = await tx
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.boardId, input.boardId), isNull(lists.deletedAt)));

      if (boardLists.length > 0) {
        await tx
          .update(projectListSettings)
          .set({ isCompletionColumn: false, updatedAt: new Date() })
          .where(
            and(
              inArray(
                projectListSettings.listId,
                boardLists.map((list) => list.id),
              ),
              eq(projectListSettings.isCompletionColumn, true),
            ),
          );
      }
    }

    const [settings] = await tx
      .insert(projectListSettings)
      .values({
        listId: input.listId,
        isCompletionColumn: input.isCompletionColumn,
      })
      .onConflictDoUpdate({
        target: projectListSettings.listId,
        set: {
          isCompletionColumn: input.isCompletionColumn,
          updatedAt: new Date(),
        },
      })
      .returning({
        isCompletionColumn: projectListSettings.isCompletionColumn,
      });
    return settings;
  });

export const setCardPlanning = async (
  db: dbClient,
  input: {
    cardId: number;
    cycleId: number | null;
    estimateValue: number | null;
  },
) =>
  db.transaction(async (tx) => {
    const current = await tx.query.projectCardPlanning.findFirst({
      columns: { cycleId: true, estimateValue: true },
      where: eq(projectCardPlanning.cardId, input.cardId),
    });
    const now = new Date();

    if (current?.cycleId !== input.cycleId) {
      await tx
        .update(projectCycleCards)
        .set({ removedAt: now })
        .where(
          and(
            eq(projectCycleCards.cardId, input.cardId),
            isNull(projectCycleCards.removedAt),
          ),
        );

      if (input.cycleId != null) {
        await tx.insert(projectCycleCards).values({
          cycleId: input.cycleId,
          cardId: input.cardId,
          estimateSnapshot: input.estimateValue?.toString(),
        });
      }
    }

    await tx
      .insert(projectCardPlanning)
      .values({
        cardId: input.cardId,
        cycleId: input.cycleId,
        estimateValue: input.estimateValue?.toString(),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: projectCardPlanning.cardId,
        set: {
          cycleId: input.cycleId,
          estimateValue: input.estimateValue?.toString(),
          updatedAt: now,
        },
      });

    return { success: true };
  });

export const getScrumReport = async (
  db: dbClient,
  input: { boardId: number; cyclePublicId?: string },
) => {
  const cycles = await db
    .select({
      id: projectCycles.id,
      publicId: projectCycles.publicId,
      name: projectCycles.name,
      status: projectCycles.status,
      completedAt: projectCycles.completedAt,
    })
    .from(projectCycles)
    .where(eq(projectCycles.boardId, input.boardId))
    .orderBy(desc(projectCycles.createdAt));

  const selectedCycle = input.cyclePublicId
    ? cycles.find((cycle) => cycle.publicId === input.cyclePublicId)
    : cycles.find((cycle) => cycle.status === "active");

  const getRows = async (cycleId: number, includeHistory: boolean) =>
    db
      .select({
        estimateSnapshot: projectCycleCards.estimateSnapshot,
        completedAt: projectCycleCards.completedAt,
        isCompletionColumn: projectListSettings.isCompletionColumn,
      })
      .from(projectCycleCards)
      .innerJoin(cards, eq(projectCycleCards.cardId, cards.id))
      .innerJoin(lists, eq(cards.listId, lists.id))
      .leftJoin(projectListSettings, eq(projectListSettings.listId, lists.id))
      .where(
        and(
          eq(projectCycleCards.cycleId, cycleId),
          isNull(cards.deletedAt),
          includeHistory ? undefined : isNull(projectCycleCards.removedAt),
        ),
      );

  const currentRows = selectedCycle
    ? await getRows(selectedCycle.id, selectedCycle.status === "completed")
    : [];
  const totalEstimate = currentRows.reduce(
    (sum, row) => sum + (toEstimateNumber(row.estimateSnapshot) ?? 0),
    0,
  );
  const completedRows = currentRows.filter((row) =>
    selectedCycle?.status === "completed"
      ? row.completedAt != null
      : row.isCompletionColumn === true,
  );
  const completedEstimate = completedRows.reduce(
    (sum, row) => sum + (toEstimateNumber(row.estimateSnapshot) ?? 0),
    0,
  );

  const velocity = await Promise.all(
    cycles
      .filter((cycle) => cycle.status === "completed")
      .slice(0, 6)
      .map(async (cycle) => {
        const rows = await getRows(cycle.id, true);
        return {
          publicId: cycle.publicId,
          name: cycle.name,
          completedEstimate: rows
            .filter((row) => row.completedAt != null)
            .reduce(
              (sum, row) => sum + (toEstimateNumber(row.estimateSnapshot) ?? 0),
              0,
            ),
        };
      }),
  );

  return {
    cycle: selectedCycle
      ? {
          publicId: selectedCycle.publicId,
          name: selectedCycle.name,
          status: selectedCycle.status,
        }
      : null,
    burndown: {
      totalCards: currentRows.length,
      completedCards: completedRows.length,
      remainingCards: currentRows.length - completedRows.length,
      totalEstimate,
      completedEstimate,
      remainingEstimate: totalEstimate - completedEstimate,
    },
    velocity,
  };
};
