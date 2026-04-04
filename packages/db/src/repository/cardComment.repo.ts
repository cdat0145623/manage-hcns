import { count, eq, isNull, and, desc } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { comments } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const getCount = async (db: dbClient) => {
  const result = await db
    .select({ count: count() })
    .from(comments)
    .where(isNull(comments.deletedAt));

  return result[0]?.count ?? 0;
};

export const create = async (
  db: dbClient,
  commentInput: {
    cardId?: number;
    taskInstanceId?: string;
    comment: string;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(comments)
    .values({
      publicId: generateUID(),
      comment: commentInput.comment,
      createdBy: commentInput.createdBy,
      cardId: commentInput.cardId,
      taskInstanceId: commentInput.taskInstanceId,
    })
    .returning({
      id: comments.id,
      publicId: comments.publicId,
      comment: comments.comment,
    });

  return result;
};

export const getByPublicId = (db: dbClient, publicId: string) => {
  return db.query.comments.findFirst({
    columns: {
      id: true,
      publicId: true,
      comment: true,
      createdBy: true,
    },
    where: eq(comments.publicId, publicId),
  });
};

export const update = async (
  db: dbClient,
  commentInput: {
    id: number;
    comment: string;
  },
) => {
  const [result] = await db
    .update(comments)
    .set({
      comment: commentInput.comment,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, commentInput.id))
    .returning({
      id: comments.id,
      publicId: comments.publicId,
      comment: comments.comment,
    });

  return result;
};

export const softDelete = async (
  db: dbClient,
  args: {
    commentId: number;
    deletedAt: Date;
    deletedBy: string;
  },
) => {
  const [result] = await db
    .update(comments)
    .set({ deletedAt: args.deletedAt, deletedBy: args.deletedBy })
    .where(eq(comments.id, args.commentId))
    .returning({ id: comments.id });

  return result;
};

export const getAllByTaskInstanceId = async (db: dbClient, taskInstanceId: string) => {
  return db.query.comments.findMany({
    where: and(
      eq(comments.taskInstanceId, taskInstanceId),
      isNull(comments.deletedAt),
    ),
    with: {
      createdBy: {
        columns: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
    orderBy: desc(comments.createdAt),
  });
};

export const getAllByCardId = async (db: dbClient, cardId: number) => {
  return db.query.comments.findMany({
    where: and(
      eq(comments.cardId, cardId),
      isNull(comments.deletedAt),
    ),
    with: {
      createdBy: {
        columns: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
    orderBy: desc(comments.createdAt),
  });
};
