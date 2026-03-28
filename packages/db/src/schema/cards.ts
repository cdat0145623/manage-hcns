import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { boards } from "./boards";
import { checklists } from "./checklists";
import { imports } from "./imports";
import { labels } from "./labels";
import { lists } from "./lists";
import { users } from "./users";
import { workspaceMembers } from "./workspaces";
import { taskInstances, fileActivityLog } from "./tasks";

export const activityTypes = [
  "created",
  "updated_title",
  "updated_description",
  "updated_list",
  "updated_index",
  "status_changed",
  "member_assigned",
  "member_unassigned",
  "deadline_changed",
  "comment",
  "updated_comment_added",
  "updated_comment_updated",
  "updated_comment_deleted",
  "updated_checklist_added",
  "updated_checklist_renamed",
  "updated_checklist_deleted",
  "updated_checklist_item_added",
  "updated_checklist_item_updated",
  "updated_checklist_item_completed",
  "updated_checklist_item_uncompleted",
  "updated_checklist_item_deleted",
  "updated_attachment_added",
  "updated_attachment_removed",
  "updated_label_added",
  "updated_label_removed",
  "archived",
  "updated_attachment_renamed",
  "deadline_added",
  "deadline_removed",
] as const;

export type ActivityType = (typeof activityTypes)[number];

export const activityTypeEnum = pgEnum("card_activity_type", activityTypes);

export const cards = pgTable("card", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  index: integer("index").notNull(),
  targetUser: uuid("targetUser").references(() => users.id, {
    onDelete: "set null",
  }),
  createdBy: uuid("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: uuid("deletedBy").references(() => users.id, {
    onDelete: "set null",
  }),
  listId: bigint("listId", { mode: "number" })
    .notNull()
    .references(() => lists.id, { onDelete: "cascade" }),
  importId: bigint("importId", { mode: "number" }).references(() => imports.id),
  dueDate: timestamp("dueDate"),
}).enableRLS();

export const cardsRelations = relations(cards, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [cards.createdBy],
    references: [users.id],
    relationName: "cardsCreatedByUser",
  }),
  targetUser: one(users, {
    fields: [cards.targetUser],
    references: [users.id],
    relationName: "cardsTargetUser",
  }),
  list: one(lists, {
    fields: [cards.listId],
    references: [lists.id],
    relationName: "cardsList",
  }),
  deletedBy: one(users, {
    fields: [cards.deletedBy],
    references: [users.id],
    relationName: "cardsDeletedByUser",
  }),
  labels: many(cardsToLabels),
  members: many(cardToWorkspaceMembers),
  import: one(imports, {
    fields: [cards.importId],
    references: [imports.id],
    relationName: "cardsImport",
  }),
  comments: many(comments),
  activities: many(cardActivities),
  checklists: many(checklists),
  attachments: many(cardAttachments),
  fileActivities: many(fileActivityLog),
}));

export const cardActivities = pgTable("card_activity", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  type: activityTypeEnum("type").notNull(),
  cardId: bigint("cardId", { mode: "number" }).references(() => cards.id, {
    onDelete: "cascade",
  }),
  taskInstanceId: uuid("taskInstanceId").references(() => taskInstances.id),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  metadata: jsonb("metadata"),
  fromIndex: integer("fromIndex"),
  toIndex: integer("toIndex"),
  fromListId: bigint("fromListId", { mode: "number" }).references(
    () => lists.id,
    { onDelete: "cascade" },
  ),
  toListId: bigint("toListId", { mode: "number" }).references(() => lists.id, {
    onDelete: "cascade",
  }),
  labelId: bigint("labelId", { mode: "number" }).references(() => labels.id, {
    onDelete: "cascade",
  }),
  workspaceMemberId: bigint("workspaceMemberId", {
    mode: "number",
  }).references(() => workspaceMembers.id, { onDelete: "set null" }),
  fromTitle: text("fromTitle"),
  toTitle: text("toTitle"),
  fromDescription: text("fromDescription"),
  toDescription: text("toDescription"),
  createdBy: uuid("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  commentId: bigint("commentId", { mode: "number" }).references(
    () => comments.id,
    { onDelete: "cascade" },
  ),
  fromComment: text("fromComment"),
  toComment: text("toComment"),
  fromDueDate: timestamp("fromDueDate"),
  toDueDate: timestamp("toDueDate"),
  sourceBoardId: bigint("sourceBoardId", { mode: "number" }).references(
    () => boards.id,
    { onDelete: "set null" },
  ),
  attachmentId: bigint("attachmentId", { mode: "number" }).references(
    () => cardAttachments.id,
    { onDelete: "cascade" },
  ),
}).enableRLS();

export const cardActivitiesRelations = relations(cardActivities, ({ one }) => ({
  card: one(cards, {
    fields: [cardActivities.cardId],
    references: [cards.id],
    relationName: "cardActivitiesCard",
  }),
  taskInstance: one(taskInstances, {
    fields: [cardActivities.taskInstanceId],
    references: [taskInstances.id],
    relationName: "cardActivitiesTaskInstance",
  }),
  fromList: one(lists, {
    fields: [cardActivities.fromListId],
    references: [lists.id],
    relationName: "cardActivitiesFromList",
  }),
  toList: one(lists, {
    fields: [cardActivities.toListId],
    references: [lists.id],
    relationName: "cardActivitiesToList",
  }),
  label: one(labels, {
    fields: [cardActivities.labelId],
    references: [labels.id],
    relationName: "cardActivitiesLabel",
  }),
  workspaceMember: one(workspaceMembers, {
    fields: [cardActivities.workspaceMemberId],
    references: [workspaceMembers.id],
    relationName: "cardActivitiesWorkspaceMember",
  }),
  user: one(users, {
    fields: [cardActivities.createdBy],
    references: [users.id],
    relationName: "cardActivitiesUser",
  }),
  member: one(workspaceMembers, {
    fields: [cardActivities.workspaceMemberId],
    references: [workspaceMembers.id],
    relationName: "cardActivitiesMember",
  }),
  comment: one(comments, {
    fields: [cardActivities.commentId],
    references: [comments.id],
    relationName: "cardActivitiesComment",
  }),
  attachment: one(cardAttachments, {
    fields: [cardActivities.attachmentId],
    references: [cardAttachments.id],
    relationName: "cardActivitiesAttachment",
  }),
}));

export const cardsToLabels = pgTable(
  "_card_labels",
  {
    cardId: bigint("cardId", { mode: "number" })
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    labelId: bigint("labelId", { mode: "number" })
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.labelId] })],
).enableRLS();

export const cardToLabelsRelations = relations(cardsToLabels, ({ one }) => ({
  card: one(cards, {
    fields: [cardsToLabels.cardId],
    references: [cards.id],
    relationName: "cardToLabelsCard",
  }),
  label: one(labels, {
    fields: [cardsToLabels.labelId],
    references: [labels.id],
    relationName: "cardToLabelsLabel",
  }),
}));

export const cardToWorkspaceMembers = pgTable(
  "_card_workspace_members",
  {
    cardId: bigint("cardId", { mode: "number" })
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    workspaceMemberId: bigint("workspaceMemberId", { mode: "number" })
      .notNull()
      .references(() => workspaceMembers.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.workspaceMemberId] })],
).enableRLS();

export const cardToWorkspaceMembersRelations = relations(
  cardToWorkspaceMembers,
  ({ one }) => ({
    card: one(cards, {
      fields: [cardToWorkspaceMembers.cardId],
      references: [cards.id],
      relationName: "cardToWorkspaceMembersCard",
    }),
    member: one(workspaceMembers, {
      fields: [cardToWorkspaceMembers.workspaceMemberId],
      references: [workspaceMembers.id],
      relationName: "cardToWorkspaceMembersMember",
    }),
  }),
);

export const comments = pgTable("comments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  comment: text("comment").notNull(),
  cardId: bigint("cardId", { mode: "number" }).references(() => cards.id, {
    onDelete: "cascade",
  }),
  taskInstanceId: uuid("taskInstanceId").references(() => taskInstances.id),
  createdBy: uuid("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: uuid("deletedBy").references(() => users.id, {
    onDelete: "set null",
  }),
}).enableRLS();

export const commentsRelations = relations(comments, ({ one }) => ({
  card: one(cards, {
    fields: [comments.cardId],
    references: [cards.id],
    relationName: "commentsCard",
  }),
  taskInstance: one(taskInstances, {
    fields: [comments.taskInstanceId],
    references: [taskInstances.id],
    relationName: "commentsTaskInstance",
  }),
  createdBy: one(users, {
    fields: [comments.createdBy],
    references: [users.id],
    relationName: "commentsCreatedByUser",
  }),
  deletedBy: one(users, {
    fields: [comments.deletedBy],
    references: [users.id],
    relationName: "commentsDeletedByUser",
  }),
}));

export const cardAttachments = pgTable("card_attachment", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  cardId: bigint("cardId", { mode: "number" })
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
  contentType: varchar("contentType", { length: 100 }).notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  s3Key: varchar("s3Key", { length: 500 }).notNull(),
  createdBy: uuid("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}).enableRLS();

export const cardAttachmentsRelations = relations(
  cardAttachments,
  ({ one }) => ({
    card: one(cards, {
      fields: [cardAttachments.cardId],
      references: [cards.id],
      relationName: "cardAttachmentsCard",
    }),
    createdBy: one(users, {
      fields: [cardAttachments.createdBy],
      references: [users.id],
      relationName: "cardAttachmentsCreatedByUser",
    }),
  }),
);
