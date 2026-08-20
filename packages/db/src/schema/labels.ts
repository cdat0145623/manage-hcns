import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { boards } from "./boards";
import { cardsToLabels } from "./cards";
import { imports } from "./imports";
import { users } from "./users";

export const projectLabelSelectionModes = ["single", "multiple"] as const;
export type ProjectLabelSelectionMode =
  (typeof projectLabelSelectionModes)[number];
export const projectLabelSelectionModeEnum = pgEnum(
  "project_label_selection_mode",
  projectLabelSelectionModes,
);

export const projectLabelFields = pgTable(
  "project_label_field",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    boardId: bigint("boardId", { mode: "number" })
      .notNull()
      .references(() => boards.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 100 }).notNull(),
    selectionMode: projectLabelSelectionModeEnum("selectionMode")
      .notNull()
      .default("multiple"),
    index: integer("index").notNull().default(0),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    deletedAt: timestamp("deletedAt"),
    deletedBy: uuid("deletedBy").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [index("project_label_field_board_idx").on(table.boardId)],
).enableRLS();

export const labels = pgTable("label", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  colourCode: varchar("colourCode", { length: 12 }),
  createdBy: uuid("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
  boardId: bigint("boardId", { mode: "number" })
    .notNull()
    .references(() => boards.id, { onDelete: "restrict" }),
  projectLabelFieldId: bigint("projectLabelFieldId", {
    mode: "number",
  }).references(() => projectLabelFields.id, { onDelete: "set null" }),
  importId: bigint("importId", { mode: "number" }).references(() => imports.id),
  deletedAt: timestamp("deletedAt"),
  deletedBy: uuid("deletedBy").references(() => users.id, {
    onDelete: "set null",
  }),
}).enableRLS();

export const labelsRelations = relations(labels, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [labels.createdBy],
    references: [users.id],
    relationName: "labelsCreatedByUser",
  }),
  deletedBy: one(users, {
    fields: [labels.deletedBy],
    references: [users.id],
    relationName: "labelsDeletedByUser",
  }),
  board: one(boards, {
    fields: [labels.boardId],
    references: [boards.id],
  }),
  projectLabelField: one(projectLabelFields, {
    fields: [labels.projectLabelFieldId],
    references: [projectLabelFields.id],
  }),
  cards: many(cardsToLabels),
  import: one(imports, {
    fields: [labels.importId],
    references: [imports.id],
    relationName: "labelsImport",
  }),
}));

export const projectLabelFieldsRelations = relations(
  projectLabelFields,
  ({ one, many }) => ({
    board: one(boards, {
      fields: [projectLabelFields.boardId],
      references: [boards.id],
    }),
    createdBy: one(users, {
      fields: [projectLabelFields.createdBy],
      references: [users.id],
      relationName: "projectLabelFieldsCreatedByUser",
    }),
    deletedBy: one(users, {
      fields: [projectLabelFields.deletedBy],
      references: [users.id],
      relationName: "projectLabelFieldsDeletedByUser",
    }),
    options: many(labels),
  }),
);
