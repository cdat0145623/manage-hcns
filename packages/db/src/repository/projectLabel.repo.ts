import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import type { ProjectLabelSelectionMode } from "@kan/db/schema";
import {
  cardActivities,
  cardsToLabels,
  labels,
  projectLabelFields,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const MAX_PROJECT_LABEL_FIELDS = 3;

export const getFields = async (db: dbClient, boardId: number) =>
  db.query.projectLabelFields.findMany({
    columns: {
      publicId: true,
      name: true,
      selectionMode: true,
      index: true,
    },
    where: and(
      eq(projectLabelFields.boardId, boardId),
      isNull(projectLabelFields.deletedAt),
    ),
    orderBy: [asc(projectLabelFields.index)],
    with: {
      options: {
        columns: { publicId: true, name: true, colourCode: true },
        where: isNull(labels.deletedAt),
        orderBy: [asc(labels.name)],
      },
    },
  });

const getField = async (
  db: dbClient,
  input: { boardId: number; fieldPublicId: string },
) =>
  db.query.projectLabelFields.findFirst({
    columns: { id: true, publicId: true, name: true, selectionMode: true },
    where: and(
      eq(projectLabelFields.boardId, input.boardId),
      eq(projectLabelFields.publicId, input.fieldPublicId),
      isNull(projectLabelFields.deletedAt),
    ),
  });

export const createField = async (
  db: dbClient,
  input: {
    boardId: number;
    name: string;
    selectionMode: ProjectLabelSelectionMode;
    createdBy: string;
  },
) =>
  db.transaction(async (tx) => {
    const activeFields = await tx.query.projectLabelFields.findMany({
      columns: { index: true },
      where: and(
        eq(projectLabelFields.boardId, input.boardId),
        isNull(projectLabelFields.deletedAt),
      ),
    });
    if (activeFields.length >= MAX_PROJECT_LABEL_FIELDS) {
      throw new Error("A project board can have at most three label fields");
    }

    const [field] = await tx
      .insert(projectLabelFields)
      .values({
        publicId: generateUID(),
        boardId: input.boardId,
        name: input.name,
        selectionMode: input.selectionMode,
        index: activeFields.length,
        createdBy: input.createdBy,
      })
      .returning({ publicId: projectLabelFields.publicId });

    if (!field) throw new Error("Unable to create project label field");
    return field;
  });

export const updateField = async (
  db: dbClient,
  input: {
    boardId: number;
    fieldPublicId: string;
    name?: string;
    selectionMode?: ProjectLabelSelectionMode;
  },
) => {
  const field = await getField(db, input);
  if (!field) throw new Error("Project label field not found");

  const [updated] = await db
    .update(projectLabelFields)
    .set({
      name: input.name,
      selectionMode: input.selectionMode,
      updatedAt: new Date(),
    })
    .where(eq(projectLabelFields.id, field.id))
    .returning({ publicId: projectLabelFields.publicId });

  return updated ?? { publicId: input.fieldPublicId };
};

export const deleteField = async (
  db: dbClient,
  input: { boardId: number; fieldPublicId: string; deletedBy: string },
) =>
  db.transaction(async (tx) => {
    const field = await getField(tx, input);
    if (!field) throw new Error("Project label field not found");

    const deletedAt = new Date();
    await tx
      .update(labels)
      .set({ deletedAt, deletedBy: input.deletedBy })
      .where(
        and(eq(labels.projectLabelFieldId, field.id), isNull(labels.deletedAt)),
      );
    await tx
      .update(projectLabelFields)
      .set({ deletedAt, deletedBy: input.deletedBy })
      .where(eq(projectLabelFields.id, field.id));

    return { success: true };
  });

export const createOption = async (
  db: dbClient,
  input: {
    boardId: number;
    fieldPublicId: string;
    name: string;
    colourCode?: string | null;
    createdBy: string;
  },
) => {
  const field = await getField(db, input);
  if (!field) throw new Error("Project label field not found");

  const [option] = await db
    .insert(labels)
    .values({
      publicId: generateUID(),
      boardId: input.boardId,
      projectLabelFieldId: field.id,
      name: input.name,
      colourCode: input.colourCode ?? null,
      createdBy: input.createdBy,
    })
    .returning({ publicId: labels.publicId });

  if (!option) throw new Error("Unable to create project label option");
  return option;
};

const getOption = async (
  db: dbClient,
  input: { boardId: number; optionPublicId: string },
) =>
  db.query.labels.findFirst({
    columns: { id: true, publicId: true, projectLabelFieldId: true },
    where: and(
      eq(labels.boardId, input.boardId),
      eq(labels.publicId, input.optionPublicId),
      isNull(labels.deletedAt),
    ),
  });

export const updateOption = async (
  db: dbClient,
  input: {
    boardId: number;
    optionPublicId: string;
    name?: string;
    colourCode?: string | null;
  },
) => {
  const option = await getOption(db, input);
  if (!option?.projectLabelFieldId) {
    throw new Error("Project label option not found");
  }

  const [updated] = await db
    .update(labels)
    .set({
      name: input.name,
      colourCode: input.colourCode,
      updatedAt: new Date(),
    })
    .where(eq(labels.id, option.id))
    .returning({ publicId: labels.publicId });

  return updated ?? { publicId: input.optionPublicId };
};

export const deleteOption = async (
  db: dbClient,
  input: { boardId: number; optionPublicId: string; deletedBy: string },
) => {
  const option = await getOption(db, input);
  if (!option?.projectLabelFieldId) {
    throw new Error("Project label option not found");
  }

  await db
    .update(labels)
    .set({ deletedAt: new Date(), deletedBy: input.deletedBy })
    .where(eq(labels.id, option.id));
  return { success: true };
};

export const setCardOptions = async (
  db: dbClient,
  input: {
    cardId: number;
    boardId: number;
    fieldPublicId: string;
    optionPublicIds: string[];
    userId: string;
  },
) =>
  db.transaction(async (tx) => {
    const field = await getField(tx, input);
    if (!field) throw new Error("Project label field not found");
    if (field.selectionMode === "single" && input.optionPublicIds.length > 1) {
      throw new Error("A single-choice label field accepts one option");
    }

    const optionIds = input.optionPublicIds.length
      ? await tx
          .select({ id: labels.id, publicId: labels.publicId })
          .from(labels)
          .where(
            and(
              eq(labels.boardId, input.boardId),
              eq(labels.projectLabelFieldId, field.id),
              inArray(labels.publicId, input.optionPublicIds),
              isNull(labels.deletedAt),
            ),
          )
      : [];
    if (optionIds.length !== new Set(input.optionPublicIds).size) {
      throw new Error("Every label option must belong to this field");
    }

    const existing = await tx
      .select({ labelId: cardsToLabels.labelId })
      .from(cardsToLabels)
      .innerJoin(labels, eq(cardsToLabels.labelId, labels.id))
      .where(
        and(
          eq(cardsToLabels.cardId, input.cardId),
          eq(labels.projectLabelFieldId, field.id),
          isNull(labels.deletedAt),
        ),
      );
    const nextIds = new Set(optionIds.map((option) => option.id));
    const existingIds = new Set(existing.map((option) => option.labelId));

    await tx
      .delete(cardsToLabels)
      .where(
        and(
          eq(cardsToLabels.cardId, input.cardId),
          inArray(
            cardsToLabels.labelId,
            existing.length ? existing.map((option) => option.labelId) : [-1],
          ),
        ),
      );
    if (optionIds.length > 0) {
      await tx.insert(cardsToLabels).values(
        optionIds.map((option) => ({
          cardId: input.cardId,
          labelId: option.id,
        })),
      );
    }

    for (const option of optionIds) {
      if (!existingIds.has(option.id)) {
        await tx.insert(cardActivities).values({
          publicId: generateUID(),
          cardId: input.cardId,
          labelId: option.id,
          type: "updated_label_added",
          createdBy: input.userId,
        });
      }
    }
    for (const option of existing) {
      if (!nextIds.has(option.labelId)) {
        await tx.insert(cardActivities).values({
          publicId: generateUID(),
          cardId: input.cardId,
          labelId: option.labelId,
          type: "updated_label_removed",
          createdBy: input.userId,
        });
      }
    }

    return { success: true, optionPublicIds: input.optionPublicIds };
  });
