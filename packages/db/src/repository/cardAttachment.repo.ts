import type { dbClient } from "@kan/db/client";
import * as fileActivityLogRepo from "@kan/db/repository/fileActivityLog.repo";

export const create = async (
  db: dbClient,
  input: {
    cardId: number;
    filename: string;
    originalFilename: string;
    contentType: string;
    size: number;
    s3Key: string;
    createdBy: string;
  },
) => {
  return fileActivityLogRepo.create(db, {
    cardId: input.cardId,
    activityType: "file_uploaded",
    fileName: input.originalFilename,
    newFileUrl: input.s3Key,
    fileSize: input.size,
    mimeType: input.contentType,
    createdBy: input.createdBy,
  });
};

export const getAllByCardId = (db: dbClient, cardId: number) => {
  return fileActivityLogRepo.getAllByCardId(db, cardId);
};

export const softDelete = (
  db: dbClient,
  input: {
    publicId: string;
    createdBy: string;
  },
) => {
  return fileActivityLogRepo.softDelete(db, input);
};

export const updateFilename = (
  db: dbClient,
  input: {
    publicId: string;
    fileName: string;
  },
) => {
  return fileActivityLogRepo.updateFilename(db, input);
};
