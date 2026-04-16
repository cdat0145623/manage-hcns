import { relations, sql } from "drizzle-orm";
import {
  bigint,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
  unique,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { cards } from "./cards";
import { checklists } from "./checklists";

export const statusTypeEnum = pgEnum("statusType", [
  "pending",
  "done",
  "missed",
  "draft",
  "waiting_approval",
  "approved",
  "rejected",
  "waiting_evaluation",
  "completed"
]);
export const fileActivityTypeEnum = pgEnum("file_activity_type", [
  "file_uploaded",
  "file_deleted",
  "file_replaced",
]);

export const frequence = pgTable("frequence", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  name: varchar("name", { length: 255 }).notNull(),
  rruleString: text("rruleString"), // Ví dụ: 'FREQ=WEEKLY;BYDAY=MO'
  dtStart: timestamp("dtStart"), // Ngày bắt đầu tính nhịp
  createdAt: timestamp("createAt").notNull().defaultNow(),
  updatedAt: timestamp("updateAt").notNull().defaultNow(),
});

export const taskMasters = pgTable("taskMasters", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  freqId: uuid("freqId")
    .notNull()
    .references(() => frequence.id),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  targetUser: uuid("targetUser")
    .notNull()
    .references(() => users.id),
  isDeleted: boolean("isDeleted").notNull().default(false),
  createdBy: uuid("createdBy")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  deletedAt: timestamp("deletedAt"),
  deletedBy: uuid("deletedBy").references(() => users.id, {
    onDelete: "restrict",
  }),
});

export const taskInstances = pgTable(
  "taskInstances",
  {
    id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id),
    taskMasterId: uuid("taskMasterId")
      .notNull()
      .references(() => taskMasters.id),
    name: varchar("name", { length: 255 }),
    description: text("description"),
    targetDate: timestamp("targetDate"),
    actualDate: timestamp("actualDate"),
    status: statusTypeEnum("status").notNull().default("pending"),
    isDeleted: boolean("isDeleted").notNull().default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deleteAt: timestamp("deleteAt"),
    deleteBy: uuid("deleteBy").references(() => users.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    unique().on(t.userId, t.taskMasterId, t.targetDate),
    index("task_instances_user_target_idx").on(t.userId, t.targetDate),
    index("task_instances_master_idx").on(t.taskMasterId),
  ],
);

export const fileActivityLog = pgTable(
  "file_activity_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    taskInstanceId: uuid("taskInstanceId").references(() => taskInstances.id),
    cardId: bigint("cardId", { mode: "number" }).references(() => cards.id),
    activityType: fileActivityTypeEnum("activityType").notNull(),
    fileName: varchar("fileName", { length: 255 }),
    oldFileUrl: varchar("oldFileUrl", { length: 500 }),
    newFileUrl: varchar("newFileUrl", { length: 500 }),
    fileSize: bigint("fileSize", { mode: "number" }),
    mimeType: varchar("mimeType", { length: 100 }),
    metadata: text("metadata"), // Using text for JSONB for now or jsonb helper
    createdBy: uuid("createdBy")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
    deletedBy: uuid("deletedBy").references(() => users.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    index("file_activity_task_instance_idx").on(t.taskInstanceId),
    index("file_activity_card_idx").on(t.cardId),
    index("file_activity_type_idx").on(t.activityType),
    index("file_activity_created_at_idx").on(t.createdAt),
    // Check constraint will be added in migration or we can try custom sql
    // Drizzle doesn't have a native check() yet but some adapters support it
  ],
);

export const frequenceRelations = relations(frequence, ({ many }) => ({
  taskMasters: many(taskMasters),
}));

export const taskMasterRelations = relations(taskMasters, ({ one, many }) => ({
  frequence: one(frequence, {
    fields: [taskMasters.freqId],
    references: [frequence.id],
  }),
  assignee: one(users, {
    fields: [taskMasters.targetUser],
    references: [users.id],
    relationName: "taskMastersTargetUser",
  }),
  creator: one(users, {
    fields: [taskMasters.createdBy],
    references: [users.id],
    relationName: "taskMastersCreatedByUser",
  }),
  instances: many(taskInstances),
}));

export const taskInstanceRelations = relations(taskInstances, ({ one, many }) => ({
  user: one(users, {
    fields: [taskInstances.userId],
    references: [users.id],
  }),
  taskMaster: one(taskMasters, {
    fields: [taskInstances.taskMasterId],
    references: [taskMasters.id],
  }),
  fileActivities: many(fileActivityLog),
  checklists: many(checklists),
}));

export const fileActivityLogRelations = relations(fileActivityLog, ({ one }) => ({
  taskInstance: one(taskInstances, {
    fields: [fileActivityLog.taskInstanceId],
    references: [taskInstances.id],
  }),
  card: one(cards, {
    fields: [fileActivityLog.cardId],
    references: [cards.id],
  }),
  createdBy: one(users, {
    fields: [fileActivityLog.createdBy],
    references: [users.id],
  }),
}));
