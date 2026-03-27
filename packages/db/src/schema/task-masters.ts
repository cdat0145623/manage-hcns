import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { cards } from "./cards";
import { users } from "./users";
import { workspaces } from "./workspaces";

// ---------------------------------------------------------------------------
// Recurrence rule types (stored as JSONB)
// ---------------------------------------------------------------------------

export interface WeeklyRule {
  type: "weekly";
  /** Days of week: 0 = Sunday, 1 = Monday, … 6 = Saturday */
  daysOfWeek: number[];
}

export interface MonthlyWeekdayRule {
  type: "monthly_weekday";
  /** 1-indexed week of month (1 = first, 2 = second, …) */
  week: number;
  /** Day of week: 0 = Sunday, 1 = Monday, … 6 = Saturday */
  dayOfWeek: number;
}

export interface MonthlyDateRule {
  type: "monthly_date";
  /** 1–31; dates that don't exist in a month are skipped */
  dayOfMonth: number;
}

export type RecurrenceRule =
  | WeeklyRule
  | MonthlyWeekdayRule
  | MonthlyDateRule;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const taskInstanceStatuses = [
  "pending",
  "in_progress",
  "done",
  "skipped",
] as const;
export type TaskInstanceStatus = (typeof taskInstanceStatuses)[number];
export const taskInstanceStatusEnum = pgEnum(
  "task_instance_status",
  taskInstanceStatuses,
);

// ---------------------------------------------------------------------------
// task_masters
// ---------------------------------------------------------------------------

export const taskMasters = pgTable("task_masters", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  workspaceId: bigint("workspaceId", { mode: "number" })
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  /** RecurrenceRule stored as JSONB */
  recurrenceRule: jsonb("recurrenceRule").$type<RecurrenceRule>().notNull(),
  /** Default start time in "HH:mm" format */
  defaultStartTime: varchar("defaultStartTime", { length: 5 }),
  /** Default end time in "HH:mm" format */
  defaultEndTime: varchar("defaultEndTime", { length: 5 }),
  isActive: boolean("isActive").notNull().default(true),
  createdBy: uuid("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
  deletedAt: timestamp("deletedAt"),
});

export const taskMastersRelations = relations(taskMasters, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [taskMasters.workspaceId],
    references: [workspaces.id],
    relationName: "taskMastersWorkspace",
  }),
  createdBy: one(users, {
    fields: [taskMasters.createdBy],
    references: [users.id],
    relationName: "taskMastersCreatedByUser",
  }),
  instances: many(taskInstances),
}));

// ---------------------------------------------------------------------------
// task_instances
// ---------------------------------------------------------------------------

export const taskInstances = pgTable(
  "task_instances",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    masterId: bigint("masterId", { mode: "number" })
      .notNull()
      .references(() => taskMasters.id, { onDelete: "cascade" }),
    /** The scheduled date for this occurrence (date only, no time) */
    targetDate: date("targetDate", { mode: "date" }).notNull(),
    status: taskInstanceStatusEnum("status").notNull().default("pending"),
    actualStartAt: timestamp("actualStartAt"),
    actualEndAt: timestamp("actualEndAt"),
    note: text("note"),
    /** Optional link to a kanbn card for full comment/attachment/activity integration */
    cardId: bigint("cardId", { mode: "number" }).references(() => cards.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (t) => [
    // Each master can have at most one instance per target date
    uniqueIndex("task_instances_master_date_idx").on(t.masterId, t.targetDate),
  ],
);

export const taskInstancesRelations = relations(taskInstances, ({ one }) => ({
  master: one(taskMasters, {
    fields: [taskInstances.masterId],
    references: [taskMasters.id],
    relationName: "taskInstancesMaster",
  }),
  card: one(cards, {
    fields: [taskInstances.cardId],
    references: [cards.id],
    relationName: "taskInstancesCard",
  }),
  createdBy: one(users, {
    fields: [taskInstances.createdBy],
    references: [users.id],
    relationName: "taskInstancesCreatedByUser",
  }),
}));
