import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import * as cardRepo from "@kan/db/repository/card.repo";
import {
  boards,
  cardActivities,
  cards,
  cardsToLabels,
  labels,
  lists,
  projectBoardMembers,
  projectCardMembers,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

const MAX_CARD_DEPTH = 3;

export const getCardContext = async (db: dbClient, cardPublicId: string) =>
  db.query.cards.findFirst({
    columns: { id: true, parentCardId: true, createdBy: true },
    where: and(eq(cards.publicId, cardPublicId), isNull(cards.deletedAt)),
    with: {
      list: {
        columns: { id: true, boardId: true },
        with: {
          board: {
            columns: {
              id: true,
              publicId: true,
              workspaceId: true,
              mode: true,
              isArchived: true,
            },
          },
        },
      },
    },
  });

const getParentDepth = async (db: dbClient, parentCardId: number) => {
  let currentId: number | null = parentCardId;
  let depth = 0;
  const visited = new Set<number>();

  while (currentId !== null) {
    if (visited.has(currentId))
      throw new Error("Card hierarchy contains a cycle");
    visited.add(currentId);

    const parentRow: { parentCardId: number | null } | undefined =
      await db.query.cards.findFirst({
        columns: { parentCardId: true },
        where: and(eq(cards.id, currentId), isNull(cards.deletedAt)),
      });

    if (!parentRow) throw new Error("Parent card not found");
    currentId = parentRow.parentCardId;
    depth += 1;
  }

  return depth;
};

const getDescendantIds = async (db: dbClient, rootId: number) => {
  const descendants: number[] = [];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await db
      .select({ id: cards.id })
      .from(cards)
      .where(
        and(inArray(cards.parentCardId, frontier), isNull(cards.deletedAt)),
      );

    frontier = children.map((child) => child.id);
    descendants.push(...frontier);
  }

  return descendants;
};

const getDescendantDepth = async (db: dbClient, rootId: number) => {
  let frontier = [rootId];
  let depth = 0;

  while (frontier.length > 0) {
    const children = await db
      .select({ id: cards.id })
      .from(cards)
      .where(
        and(inArray(cards.parentCardId, frontier), isNull(cards.deletedAt)),
      );

    if (children.length === 0) break;
    frontier = children.map((child) => child.id);
    depth += 1;
  }

  return depth;
};

const validateParent = async (
  db: dbClient,
  input: { boardId: number; cardId?: number; parentCardId?: number | null },
) => {
  if (input.parentCardId == null) return 1;
  if (input.parentCardId === input.cardId) {
    throw new Error("A card cannot be its own parent");
  }

  const parent = await db.query.cards.findFirst({
    columns: { id: true, parentCardId: true },
    where: and(eq(cards.id, input.parentCardId), isNull(cards.deletedAt)),
    with: { list: { columns: { boardId: true } } },
  });

  if (!parent || parent.list.boardId !== input.boardId) {
    throw new Error("Parent card must belong to the same board");
  }

  if (input.cardId != null) {
    const descendants = await getDescendantIds(db, input.cardId);
    if (descendants.includes(input.parentCardId)) {
      throw new Error("A card cannot be moved below one of its descendants");
    }
  }

  const depth = (await getParentDepth(db, input.parentCardId)) + 1;
  const descendantDepth = input.cardId
    ? await getDescendantDepth(db, input.cardId)
    : 0;

  if (depth + descendantDepth > MAX_CARD_DEPTH) {
    throw new Error("Cards can have at most three hierarchy levels");
  }

  return depth;
};

const getProjectMemberIds = async (
  db: dbClient,
  boardId: number,
  workspaceMemberIds: number[],
) => {
  if (workspaceMemberIds.length === 0) return [];

  const members = await db
    .select({ workspaceMemberId: projectBoardMembers.workspaceMemberId })
    .from(projectBoardMembers)
    .where(
      and(
        eq(projectBoardMembers.boardId, boardId),
        inArray(projectBoardMembers.workspaceMemberId, workspaceMemberIds),
        isNull(projectBoardMembers.deletedAt),
      ),
    );

  const validIds = new Set(members.map((member) => member.workspaceMemberId));
  if (validIds.size !== new Set(workspaceMemberIds).size) {
    throw new Error("Every card member must be a member of the project board");
  }

  return [...validIds];
};

export const create = async (
  db: dbClient,
  input: {
    title: string;
    description?: string;
    listId: number;
    createdBy: string;
    position: "start" | "end";
    parentCardId?: number | null;
    dueDate?: Date | null;
    startDate?: Date | null;
    status?: "pending" | "done" | "missed";
    workspaceMemberIds: number[];
  },
) =>
  db.transaction(async (tx) => {
    const list = await tx.query.lists.findFirst({
      columns: { id: true, boardId: true },
      where: and(eq(lists.id, input.listId), isNull(lists.deletedAt)),
      with: {
        board: { columns: { id: true, mode: true, projectCode: true } },
      },
    });

    if (!list || list.board.mode !== "project") {
      throw new Error("Project list not found");
    }

    const [sequence] = await tx
      .update(boards)
      .set({ nextCardNumber: sql`${boards.nextCardNumber} + 1` })
      .where(eq(boards.id, list.boardId))
      .returning({
        projectCode: boards.projectCode,
        nextCardNumber: boards.nextCardNumber,
      });

    if (!sequence?.projectCode) {
      throw new Error("Project code is not configured");
    }

    const cardNumber = sequence.nextCardNumber - 1;

    await validateParent(tx, {
      boardId: list.boardId,
      parentCardId: input.parentCardId,
    });

    const memberIds = await getProjectMemberIds(
      tx,
      list.boardId,
      input.workspaceMemberIds,
    );

    let index = 0;
    if (input.position === "end") {
      const lastCard = await tx.query.cards.findFirst({
        columns: { index: true },
        where: and(eq(cards.listId, input.listId), isNull(cards.deletedAt)),
        orderBy: [desc(cards.index)],
      });
      index = lastCard ? lastCard.index + 1 : 0;
    } else {
      await tx.execute(sql`
        UPDATE "card"
        SET "index" = "index" + 1
        WHERE "listId" = ${input.listId}
          AND "index" >= ${index}
          AND "deletedAt" IS NULL;
      `);
    }

    const [card] = await tx
      .insert(cards)
      .values({
        publicId: generateUID(),
        cardNumber,
        title: input.title,
        description: input.description ?? null,
        createdBy: input.createdBy,
        listId: input.listId,
        index,
        parentCardId: input.parentCardId ?? null,
        dueDate: input.dueDate ?? null,
        startDate: input.startDate ?? null,
        status: input.status,
      })
      .returning({ id: cards.id, publicId: cards.publicId });

    if (!card) throw new Error("Unable to create project card");

    await tx.insert(cardActivities).values({
      publicId: generateUID(),
      cardId: card.id,
      type: "created",
      createdBy: input.createdBy,
    });

    if (memberIds.length > 0) {
      await tx.insert(projectCardMembers).values(
        memberIds.map((workspaceMemberId) => ({
          cardId: card.id,
          workspaceMemberId,
        })),
      );
    }

    return {
      publicId: card.publicId,
      code: `${sequence.projectCode}-${cardNumber}`,
    };
  });

export const update = async (
  db: dbClient,
  input: {
    cardId: number;
    boardId: number;
    title?: string;
    description?: string;
    parentCardId?: number | null;
    dueDate?: Date | null;
    startDate?: Date | null;
    status?: "pending" | "done" | "missed";
  },
) => {
  if (input.parentCardId !== undefined) {
    await validateParent(db, input);
  }

  const [card] = await db
    .update(cards)
    .set({
      title: input.title,
      description: input.description,
      parentCardId:
        input.parentCardId !== undefined ? input.parentCardId : undefined,
      dueDate: input.dueDate,
      startDate: input.startDate,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(and(eq(cards.id, input.cardId), isNull(cards.deletedAt)))
    .returning({ publicId: cards.publicId, title: cards.title });

  return card;
};

export const toggleLabel = async (
  db: dbClient,
  input: { cardId: number; boardId: number; labelId: number; userId: string },
) => {
  const label = await db.query.labels.findFirst({
    columns: { id: true },
    where: and(
      eq(labels.id, input.labelId),
      eq(labels.boardId, input.boardId),
      isNull(labels.deletedAt),
    ),
  });
  if (!label) throw new Error("Label does not belong to this project board");

  const existing = await db.query.cardsToLabels.findFirst({
    where: and(
      eq(cardsToLabels.cardId, input.cardId),
      eq(cardsToLabels.labelId, input.labelId),
    ),
  });

  if (existing) {
    await db
      .delete(cardsToLabels)
      .where(
        and(
          eq(cardsToLabels.cardId, input.cardId),
          eq(cardsToLabels.labelId, input.labelId),
        ),
      );
    await db.insert(cardActivities).values({
      publicId: generateUID(),
      cardId: input.cardId,
      labelId: input.labelId,
      type: "updated_label_removed",
      createdBy: input.userId,
    });
    return { newLabel: false };
  }

  await db.insert(cardsToLabels).values({
    cardId: input.cardId,
    labelId: input.labelId,
  });
  await db.insert(cardActivities).values({
    publicId: generateUID(),
    cardId: input.cardId,
    labelId: input.labelId,
    type: "updated_label_added",
    createdBy: input.userId,
  });
  return { newLabel: true };
};

export const reorder = async (
  db: dbClient,
  input: {
    cardId: number;
    newListId?: number;
    newIndex?: number;
    status?: "pending" | "done" | "missed";
  },
) => {
  await cardRepo.reorder(db, {
    cardId: input.cardId,
    newListId: input.newListId,
    newIndex: input.newIndex,
    status: input.status,
  });
  return { success: true };
};

export const setMembers = async (
  db: dbClient,
  input: { cardId: number; boardId: number; workspaceMemberIds: number[] },
) => {
  const memberIds = await getProjectMemberIds(
    db,
    input.boardId,
    input.workspaceMemberIds,
  );

  return db.transaction(async (tx) => {
    await tx
      .delete(projectCardMembers)
      .where(eq(projectCardMembers.cardId, input.cardId));

    if (memberIds.length > 0) {
      await tx.insert(projectCardMembers).values(
        memberIds.map((workspaceMemberId) => ({
          cardId: input.cardId,
          workspaceMemberId,
        })),
      );
    }

    return { success: true };
  });
};

export const softDelete = async (
  db: dbClient,
  input: { cardId: number; deletedBy: string },
) =>
  db.transaction(async (tx) => {
    const descendantIds = await getDescendantIds(tx, input.cardId);
    const cardIds = [input.cardId, ...descendantIds];
    const existingCards = await tx
      .select({ id: cards.id, listId: cards.listId })
      .from(cards)
      .where(and(inArray(cards.id, cardIds), isNull(cards.deletedAt)));

    await tx
      .update(cards)
      .set({ deletedAt: new Date(), deletedBy: input.deletedBy })
      .where(
        inArray(
          cards.id,
          existingCards.map((card) => card.id),
        ),
      );

    const listIds = [...new Set(existingCards.map((card) => card.listId))];
    for (const listId of listIds) {
      await tx.execute(sql`
        WITH ordered AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY "index", id) - 1 AS new_index
          FROM "card"
          WHERE "listId" = ${listId} AND "deletedAt" IS NULL
        )
        UPDATE "card" c
        SET "index" = o.new_index
        FROM ordered o
        WHERE c.id = o.id;
      `);
    }

    await tx.insert(cardActivities).values(
      existingCards.map((card) => ({
        publicId: generateUID(),
        cardId: card.id,
        type: "archived" as const,
        createdBy: input.deletedBy,
      })),
    );

    return { success: true, deletedCount: existingCards.length };
  });

export const getByPublicId = async (db: dbClient, cardPublicId: string) => {
  const card = await db.query.cards.findFirst({
    columns: {
      id: true,
      publicId: true,
      cardNumber: true,
      title: true,
      description: true,
      index: true,
      dueDate: true,
      startDate: true,
      parentCardId: true,
      status: true,
    },
    where: and(eq(cards.publicId, cardPublicId), isNull(cards.deletedAt)),
    with: {
      list: {
        columns: { publicId: true, name: true, boardId: true },
        with: {
          board: { columns: { publicId: true, mode: true, projectCode: true } },
        },
      },
      projectMembers: {
        with: {
          workspaceMember: {
            columns: { publicId: true, email: true, status: true },
            with: {
              user: { columns: { name: true, email: true, image: true } },
            },
          },
        },
      },
    },
  });

  if (!card || card.list.board.mode !== "project") return null;

  const detailedCard = await cardRepo.getWithListAndMembersByPublicId(
    db,
    cardPublicId,
  );

  const [parent, children] = await Promise.all([
    card.parentCardId
      ? db.query.cards.findFirst({
          columns: { publicId: true, title: true, cardNumber: true },
          where: and(eq(cards.id, card.parentCardId), isNull(cards.deletedAt)),
        })
      : Promise.resolve(null),
    db.query.cards.findMany({
      columns: {
        publicId: true,
        cardNumber: true,
        title: true,
        index: true,
        dueDate: true,
        status: true,
      },
      where: and(eq(cards.parentCardId, card.id), isNull(cards.deletedAt)),
      orderBy: [asc(cards.index)],
      with: {
        labels: {
          with: {
            label: {
              columns: {
                publicId: true,
                name: true,
                colourCode: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    publicId: card.publicId,
    code:
      card.cardNumber != null && card.list.board.projectCode
        ? `${card.list.board.projectCode}-${card.cardNumber}`
        : null,
    title: card.title,
    description: card.description,
    index: card.index,
    dueDate: card.dueDate,
    startDate: card.startDate,
    status: card.status,
    labels: detailedCard?.labels ?? [],
    checklists: detailedCard?.checklists ?? [],
    attachments: detailedCard?.attachments ?? [],
    parent: parent
      ? {
          publicId: parent.publicId,
          title: parent.title,
          code:
            parent.cardNumber != null && card.list.board.projectCode
              ? `${card.list.board.projectCode}-${parent.cardNumber}`
              : null,
        }
      : null,
    children: children.map((child) => ({
      publicId: child.publicId,
      code:
        child.cardNumber != null && card.list.board.projectCode
          ? `${card.list.board.projectCode}-${child.cardNumber}`
          : null,
      title: child.title,
      dueDate: child.dueDate,
      status: child.status,
      labels: child.labels
        .filter((label) => !label.label.deletedAt)
        .map((label) => ({
          publicId: label.label.publicId,
          name: label.label.name,
          colourCode: label.label.colourCode,
        })),
    })),
    list: {
      publicId: card.list.publicId,
      name: card.list.name,
    },
    board: card.list.board,
    members: card.projectMembers.map((member) => member.workspaceMember),
  };
};
