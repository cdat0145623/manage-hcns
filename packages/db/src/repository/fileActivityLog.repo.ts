import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { fileActivityLog } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const getCount = async (db: dbClient) => {
  const result = await db
    .select({ count: count() })
    .from(fileActivityLog)
    .where(isNull(fileActivityLog.deletedAt));

  return result[0]?.count ?? 0;
};

export const create = async (
  db: dbClient,
  input: {
    cardId?: number;
    taskInstanceId?: string;
    activityType: "file_uploaded" | "file_deleted" | "file_replaced";
    fileName: string;
    newFileUrl?: string;
    oldFileUrl?: string;
    fileSize?: number;
    mimeType?: string;
    metadata?: string;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(fileActivityLog)
    .values({
      publicId: generateUID(),
      cardId: input.cardId,
      taskInstanceId: input.taskInstanceId,
      activityType: input.activityType,
      fileName: input.fileName,
      newFileUrl: input.newFileUrl,
      oldFileUrl: input.oldFileUrl,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      metadata: input.metadata,
      createdBy: input.createdBy,
    })
    .returning();

  return result;
};

export const getByPublicId = (db: dbClient, publicId: string) => {
  return db.query.fileActivityLog.findFirst({
    where: eq(fileActivityLog.publicId, publicId),
    with: {
      card: {
        columns: {
          id: true,
          publicId: true,
        },
        with: {
          list: {
            columns: {
              id: true,
            },
            with: {
              board: {
                columns: {
                  id: true,
                  workspaceId: true,
                },
              },
            },
          },
        },
      },
    },
  });
};

export const getAllByCardId = async (db: dbClient, cardId: number) => {
  // To get current attachments, we need to find the latest activity for each publicId
  // that is not 'file_deleted'.
  // However, if we assume each upload has a unique publicId and a delete just marks it, 
  // we can just find all 'file_uploaded' that don't have a corresponding 'file_deleted'.
  
  // For now, let's just get all file activities for the card and the frontend can handle it, 
  // OR we implement the filter here.
  
  // Implementation of "get current active files":
  const allActivities = await db.query.fileActivityLog.findMany({
    where: eq(fileActivityLog.cardId, cardId),
    orderBy: desc(fileActivityLog.createdAt),
  });

  // Simple logic: group by publicId and take the latest. If it's not 'file_deleted', it's active.
  const latestFiles = new Map<string, typeof allActivities[0]>();
  for (const activity of allActivities) {
    if (!latestFiles.has(activity.publicId)) {
      latestFiles.set(activity.publicId, activity);
    }
  }

  return Array.from(latestFiles.values()).filter(
    (f) => f.activityType !== "file_deleted",
  );
};

export const softDelete = async (
  db: dbClient,
  input: {
    publicId: string;
    createdBy: string;
  },
) => {
  const existing = await getByPublicId(db, input.publicId);
  if (!existing) return null;

  // const created = await create(db, {
  //   cardId: existing.cardId ?? undefined,
  //   taskInstanceId: existing.taskInstanceId ?? undefined,
  //   activityType: "file_deleted",
  //   fileName: existing.fileName ?? "",
  //   oldFileUrl: existing.newFileUrl ?? undefined,
  //   createdBy: input.createdBy,
  // });

  // if (!created) return null;

  return db
    .update(fileActivityLog)
    .set({
      activityType: "file_deleted",
      deletedAt: new Date(),
      deletedBy: input.createdBy,
    })
    .where(eq(fileActivityLog.id, existing.id))
    .returning();
};

export const getAllByTaskInstanceId = async (db: dbClient, taskInstanceId: string) => {
  const allActivities = await db.query.fileActivityLog.findMany({
    where: eq(fileActivityLog.taskInstanceId, taskInstanceId),
    orderBy: desc(fileActivityLog.createdAt),
  });

  const latestFiles = new Map<string, typeof allActivities[0]>();
  for (const activity of allActivities) {
    if (!latestFiles.has(activity.publicId)) {
      latestFiles.set(activity.publicId, activity);
    }
  }

  return Array.from(latestFiles.values()).filter(
    (f) => f.activityType !== "file_deleted",
  ).map((f) => ({
    publicId: f.publicId,
    mimeType: f.mimeType ?? "",
    newFileUrl: f.newFileUrl ?? "",
    fileName: f.fileName ?? "",
    fileSize: f.fileSize ?? 0,
    createdAt: f.createdAt,
  }));
};

export const updateFilename = async (
  db: dbClient,
  input: {
    publicId: string;
    fileName: string;
  },
) => {
  const [result] = await db
    .update(fileActivityLog)
    .set({ fileName: input.fileName, updatedAt: new Date() })
    .where(eq(fileActivityLog.publicId, input.publicId))
    .returning();

  return result;
};
