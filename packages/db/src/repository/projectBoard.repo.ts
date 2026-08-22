import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import * as projectLabelRepo from "@kan/db/repository/projectLabel.repo";
import * as projectPlanningRepo from "@kan/db/repository/projectPlanning.repo";
import {
  boards,
  cards,
  checklistItems,
  checklists,
  comments,
  fileActivityLog,
  labels,
  lists,
  projectBoardMembers,
  projectBoardSettings,
  projectCardMembers,
  workspaceMembers,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

const activeBoardWhere = (boardPublicId?: string) =>
  and(
    boardPublicId ? eq(boards.publicId, boardPublicId) : undefined,
    eq(boards.mode, "project"),
    isNull(boards.deletedAt),
  );

export const getActiveWorkspaceMember = async (
  db: dbClient,
  userId: string,
  workspaceId: number,
) =>
  db.query.workspaceMembers.findFirst({
    columns: {
      id: true,
      publicId: true,
      userId: true,
      status: true,
      role: true,
    },
    where: and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.status, "active"),
      isNull(workspaceMembers.deletedAt),
    ),
  });

export const getWorkspaceMemberByPublicId = async (
  db: dbClient,
  publicId: string,
) =>
  db.query.workspaceMembers.findFirst({
    columns: { id: true, publicId: true, workspaceId: true, status: true },
    where: and(
      eq(workspaceMembers.publicId, publicId),
      isNull(workspaceMembers.deletedAt),
    ),
  });

export const getWorkspaceBoardByPublicId = async (
  db: dbClient,
  boardPublicId: string,
) =>
  db.query.boards.findFirst({
    columns: {
      id: true,
      publicId: true,
      name: true,
      description: true,
      workspaceId: true,
      ownerUserId: true,
      createdBy: true,
      mode: true,
      isArchived: true,
    },
    where: activeBoardWhere(boardPublicId),
  });

export const getMembership = async (
  db: dbClient,
  boardId: number,
  workspaceMemberId: number,
) =>
  db.query.projectBoardMembers.findFirst({
    columns: { id: true, publicId: true, role: true },
    where: and(
      eq(projectBoardMembers.boardId, boardId),
      eq(projectBoardMembers.workspaceMemberId, workspaceMemberId),
      isNull(projectBoardMembers.deletedAt),
    ),
  });

export const getAccessibleBoardIds = async (
  db: dbClient,
  workspaceId: number,
  workspaceMemberId: number,
) => {
  const rows = await db
    .select({ boardId: projectBoardMembers.boardId })
    .from(projectBoardMembers)
    .innerJoin(boards, eq(projectBoardMembers.boardId, boards.id))
    .where(
      and(
        eq(boards.workspaceId, workspaceId),
        eq(boards.mode, "project"),
        isNull(boards.deletedAt),
        eq(projectBoardMembers.workspaceMemberId, workspaceMemberId),
        isNull(projectBoardMembers.deletedAt),
      ),
    );

  return rows.map((row) => row.boardId);
};

const getAccessibleCardIds = async (
  db: dbClient,
  boardId: number,
  workspaceMemberId: number,
) => {
  const rows = await db
    .select({ cardId: projectCardMembers.cardId })
    .from(projectCardMembers)
    .innerJoin(cards, eq(projectCardMembers.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(
      and(
        eq(lists.boardId, boardId),
        eq(projectCardMembers.workspaceMemberId, workspaceMemberId),
        isNull(cards.deletedAt),
        isNull(lists.deletedAt),
      ),
    );

  return rows.map((row) => row.cardId);
};

export const getAllAccessible = async (
  db: dbClient,
  workspaceId: number,
  accessibleBoardIds?: number[],
) => {
  const boardsData = await db.query.boards.findMany({
    columns: {
      publicId: true,
      name: true,
      projectCode: true,
      description: true,
      isArchived: true,
      updatedAt: true,
    },
    with: {
      lists: {
        columns: { publicId: true, name: true, index: true },
        where: isNull(lists.deletedAt),
        orderBy: [asc(lists.index)],
      },
    },
    where: and(
      eq(boards.workspaceId, workspaceId),
      eq(boards.mode, "project"),
      isNull(boards.deletedAt),
      accessibleBoardIds
        ? accessibleBoardIds.length > 0
          ? inArray(boards.id, accessibleBoardIds)
          : undefined
        : undefined,
    ),
    orderBy: [asc(boards.name)],
  });

  return boardsData;
};

export const getMembers = async (db: dbClient, boardId: number) =>
  db.query.projectBoardMembers.findMany({
    columns: { publicId: true, role: true, createdAt: true },
    where: and(
      eq(projectBoardMembers.boardId, boardId),
      isNull(projectBoardMembers.deletedAt),
    ),
    with: {
      workspaceMember: {
        columns: { publicId: true, email: true, status: true },
        with: {
          user: {
            columns: { name: true, email: true, image: true },
          },
        },
      },
    },
  });

export const getByPublicId = async (
  db: dbClient,
  boardPublicId: string,
  cardAccess?: { isAdmin: boolean; workspaceMemberId?: number },
) => {
  const boardId = await db.query.boards.findFirst({
    columns: { id: true },
    where: activeBoardWhere(boardPublicId),
  });
  if (!boardId) return null;

  const accessibleCardIds = cardAccess?.isAdmin
    ? undefined
    : cardAccess?.workspaceMemberId
      ? await getAccessibleCardIds(db, boardId.id, cardAccess.workspaceMemberId)
      : [];
  const cardVisibilityWhere = cardAccess
    ? accessibleCardIds && accessibleCardIds.length > 0
      ? inArray(cards.id, accessibleCardIds)
      : cardAccess.isAdmin
        ? undefined
        : sql`false`
    : undefined;

  const board = await db.query.boards.findFirst({
    columns: {
      id: true,
      publicId: true,
      name: true,
      projectCode: true,
      description: true,
      slug: true,
      isArchived: true,
      mode: true,
      visibility: true,
      ownerUserId: true,
    },
    with: {
      owner: { columns: { name: true } },
      lists: {
        columns: { id: true, publicId: true, name: true, index: true },
        where: isNull(lists.deletedAt),
        orderBy: [asc(lists.index)],
        with: {
          cards: {
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
              priority: true,
            },
            where: and(isNull(cards.deletedAt), cardVisibilityWhere),
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
              checklists: {
                columns: { publicId: true, name: true, index: true },
                where: isNull(checklists.deletedAt),
                orderBy: [asc(checklists.index)],
                with: {
                  items: {
                    columns: {
                      publicId: true,
                      title: true,
                      completed: true,
                      index: true,
                    },
                    where: isNull(checklistItems.deletedAt),
                    orderBy: [asc(checklistItems.index)],
                  },
                },
              },
              comments: {
                columns: { publicId: true },
                where: isNull(comments.deletedAt),
              },
              fileActivities: {
                columns: {
                  publicId: true,
                  newFileUrl: true,
                  activityType: true,
                },
                where: and(
                  isNull(fileActivityLog.deletedAt),
                  isNotNull(fileActivityLog.newFileUrl),
                ),
              },
              projectMembers: {
                with: {
                  workspaceMember: {
                    columns: { publicId: true, email: true, status: true },
                    with: {
                      user: {
                        columns: {
                          name: true,
                          email: true,
                          image: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    where: activeBoardWhere(boardPublicId),
  });

  if (!board) return null;

  const listIds = board.lists.map((list) => list.id);
  const cardPublicIds = new Map<number, string>();
  const cardIds: number[] = [];
  for (const list of board.lists) {
    for (const card of list.cards) {
      cardPublicIds.set(card.id, card.publicId);
      cardIds.push(card.id);
    }
  }

  const [members, settings, cycles, listSettings, cardPlanning, labelFields] =
    await Promise.all([
      getMembers(db, board.id),
      projectPlanningRepo.getSettings(db, board.id),
      projectPlanningRepo.getCycles(db, board.id),
      projectPlanningRepo.getListSettings(db, listIds),
      projectPlanningRepo.getCardPlanning(db, cardIds),
      projectLabelRepo.getFields(db, board.id),
    ]);

  return {
    publicId: board.publicId,
    name: board.name,
    projectCode: board.projectCode,
    description: board.description,
    slug: board.slug,
    isArchived: board.isArchived,
    mode: board.mode,
    visibility: board.visibility,
    owner: board.owner,
    members,
    labels: await db.query.labels.findMany({
      columns: { publicId: true, name: true, colourCode: true },
      where: and(eq(labels.boardId, board.id), isNull(labels.deletedAt)),
    }),
    labelFields,
    settings,
    cycles,
    lists: board.lists.map((list) => ({
      publicId: list.publicId,
      name: list.name,
      index: list.index,
      isCompletionColumn: listSettings.get(list.id) ?? false,
      cards: list.cards.map((card) => {
        const planning = cardPlanning.get(card.id);
        return {
          publicId: card.publicId,
          code:
            card.cardNumber != null && board.projectCode
              ? `${board.projectCode}-${card.cardNumber}`
              : null,
          title: card.title,
          description: card.description,
          index: card.index,
          dueDate: card.dueDate,
          startDate: card.startDate,
          status: card.status,
          priority: card.priority,
          labels: card.labels
            .filter((label) => !label.label.deletedAt)
            .map((label) => ({
              publicId: label.label.publicId,
              name: label.label.name,
              colourCode: label.label.colourCode,
            })),
          checklists: card.checklists,
          comments: card.comments,
          attachments: Array.from(
            new Map(
              card.fileActivities.map((attachment) => [
                attachment.publicId,
                { publicId: attachment.publicId },
              ]),
            ).values(),
          ),
          parentCardPublicId: card.parentCardId
            ? (cardPublicIds.get(card.parentCardId) ?? null)
            : null,
          cyclePublicId: planning?.cyclePublicId ?? null,
          estimateValue: planning?.estimateValue ?? null,
          members: card.projectMembers.map((member) => member.workspaceMember),
        };
      }),
    })),
  };
};

export const create = async (
  db: dbClient,
  input: {
    publicId: string;
    slug: string;
    name: string;
    projectCode: string;
    description?: string;
    workspaceId: number;
    createdBy: string;
    ownerUserId: string;
    ownerWorkspaceMemberId: number;
    lists: string[];
  },
) =>
  db.transaction(async (tx) => {
    const [board] = await tx
      .insert(boards)
      .values({
        publicId: input.publicId,
        slug: input.slug,
        name: input.name,
        projectCode: input.projectCode,
        description: input.description,
        workspaceId: input.workspaceId,
        createdBy: input.createdBy,
        ownerUserId: input.ownerUserId,
        mode: "project",
      })
      .returning({ id: boards.id, publicId: boards.publicId });

    if (!board) throw new Error("Unable to create project board");

    await tx.insert(projectBoardMembers).values({
      publicId: generateUID(),
      boardId: board.id,
      workspaceMemberId: input.ownerWorkspaceMemberId,
      role: "owner",
    });

    await tx.insert(projectBoardSettings).values({
      boardId: board.id,
    });

    if (input.lists.length > 0) {
      await tx.insert(lists).values(
        input.lists.map((name, index) => ({
          publicId: generateUID(),
          name,
          index,
          createdBy: input.createdBy,
          boardId: board.id,
        })),
      );
    }

    return { publicId: board.publicId };
  });

export const addMember = async (
  db: dbClient,
  input: {
    boardId: number;
    workspaceMemberId: number;
    role: "editor" | "viewer";
  },
) => {
  const existing = await db.query.projectBoardMembers.findFirst({
    columns: { id: true },
    where: and(
      eq(projectBoardMembers.boardId, input.boardId),
      eq(projectBoardMembers.workspaceMemberId, input.workspaceMemberId),
    ),
  });

  if (existing) {
    const [member] = await db
      .update(projectBoardMembers)
      .set({ role: input.role, deletedAt: null, deletedBy: null })
      .where(eq(projectBoardMembers.id, existing.id))
      .returning({
        publicId: projectBoardMembers.publicId,
        role: projectBoardMembers.role,
      });
    return member;
  }

  const [member] = await db
    .insert(projectBoardMembers)
    .values({
      publicId: generateUID(),
      boardId: input.boardId,
      workspaceMemberId: input.workspaceMemberId,
      role: input.role,
    })
    .returning({
      publicId: projectBoardMembers.publicId,
      role: projectBoardMembers.role,
    });
  return member;
};

export const removeMember = async (
  db: dbClient,
  input: { boardId: number; workspaceMemberId: number; deletedBy: string },
) =>
  db.transaction(async (tx) => {
    await tx
      .update(projectBoardMembers)
      .set({ deletedAt: new Date(), deletedBy: input.deletedBy })
      .where(
        and(
          eq(projectBoardMembers.boardId, input.boardId),
          eq(projectBoardMembers.workspaceMemberId, input.workspaceMemberId),
          isNull(projectBoardMembers.deletedAt),
        ),
      );

    const boardCards = await tx
      .select({ id: cards.id })
      .from(cards)
      .innerJoin(lists, eq(cards.listId, lists.id))
      .innerJoin(projectCardMembers, eq(projectCardMembers.cardId, cards.id))
      .where(
        and(
          eq(lists.boardId, input.boardId),
          eq(projectCardMembers.workspaceMemberId, input.workspaceMemberId),
        ),
      );

    if (boardCards.length > 0) {
      await tx.delete(projectCardMembers).where(
        and(
          eq(projectCardMembers.workspaceMemberId, input.workspaceMemberId),
          inArray(
            projectCardMembers.cardId,
            boardCards.map((card) => card.id),
          ),
        ),
      );
    }

    return { success: true };
  });
