import { and, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { positions } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const getAll = async (db: dbClient) => {
  return db.query.positions.findMany({
    where: isNull(positions.deletedAt),
    orderBy: (positions, { asc }) => [asc(positions.name)],
  });
};

export const getById = async (db: dbClient, positionId: number) => {
  return db.query.positions.findFirst({
    where: and(eq(positions.id, positionId), isNull(positions.deletedAt)),
  });
};

export const getByPublicId = async (db: dbClient, publicId: string) => {
  return db.query.positions.findFirst({
    where: and(eq(positions.publicId, publicId), isNull(positions.deletedAt)),
  });
};

export const create = async (
  db: dbClient,
  input: {
    name: string;
    description: string | null;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(positions)
    .values({
      publicId: generateUID(),
      name: input.name,
      description: input.description,
      createdBy: input.createdBy,
    })
    .returning();

  return result;
};

export const update = async (
  db: dbClient,
  input: {
    publicId: string;
    name?: string;
    description?: string | null;
  },
) => {
  const [result] = await db
    .update(positions)
    .set({
      name: input.name,
      description: input.description,
      updatedAt: new Date(),
    })
    .where(eq(positions.publicId, input.publicId))
    .returning();

  return result;
};

export const softDelete = async (
  db: dbClient,
  args: {
    publicId: string;
    deletedAt: Date;
    deletedBy: string;
  },
) => {
  const [result] = await db
    .update(positions)
    .set({
      deletedAt: args.deletedAt,
      deletedBy: args.deletedBy,
    })
    .where(eq(positions.publicId, args.publicId))
    .returning();

  return result;
};
