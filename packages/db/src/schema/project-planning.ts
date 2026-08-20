import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { boards } from "./boards";
import { cards } from "./cards";
import { lists } from "./lists";
import { users } from "./users";

export const projectWorkflowTypes = ["general", "scrum"] as const;
export type ProjectWorkflowType = (typeof projectWorkflowTypes)[number];
export const projectWorkflowTypeEnum = pgEnum(
  "project_workflow_type",
  projectWorkflowTypes,
);

export const projectEstimationTypes = [
  "none",
  "story_points",
  "hours",
] as const;
export type ProjectEstimationType = (typeof projectEstimationTypes)[number];
export const projectEstimationTypeEnum = pgEnum(
  "project_estimation_type",
  projectEstimationTypes,
);

export const projectCycleStatuses = ["planned", "active", "completed"] as const;
export type ProjectCycleStatus = (typeof projectCycleStatuses)[number];
export const projectCycleStatusEnum = pgEnum(
  "project_cycle_status",
  projectCycleStatuses,
);

export const projectBoardSettings = pgTable("project_board_settings", {
  boardId: bigint("boardId", { mode: "number" })
    .primaryKey()
    .references(() => boards.id, { onDelete: "restrict" }),
  workflowType: projectWorkflowTypeEnum("workflowType")
    .notNull()
    .default("general"),
  estimationType: projectEstimationTypeEnum("estimationType")
    .notNull()
    .default("none"),
  enableCycles: boolean("enableCycles").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
}).enableRLS();

export const projectCycles = pgTable(
  "project_cycle",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    boardId: bigint("boardId", { mode: "number" })
      .notNull()
      .references(() => boards.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    goal: varchar("goal", { length: 2000 }),
    startsAt: timestamp("startsAt"),
    endsAt: timestamp("endsAt"),
    status: projectCycleStatusEnum("status").notNull().default("planned"),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    completedAt: timestamp("completedAt"),
  },
  (table) => [
    index("project_cycle_board_idx").on(table.boardId),
    index("project_cycle_status_idx").on(table.status),
  ],
).enableRLS();

export const projectListSettings = pgTable("project_list_settings", {
  listId: bigint("listId", { mode: "number" })
    .primaryKey()
    .references(() => lists.id, { onDelete: "restrict" }),
  isCompletionColumn: boolean("isCompletionColumn").notNull().default(false),
  updatedAt: timestamp("updatedAt"),
}).enableRLS();

export const projectCardPlanning = pgTable(
  "project_card_planning",
  {
    cardId: bigint("cardId", { mode: "number" })
      .primaryKey()
      .references(() => cards.id, { onDelete: "restrict" }),
    cycleId: bigint("cycleId", { mode: "number" }).references(
      () => projectCycles.id,
      { onDelete: "set null" },
    ),
    estimateValue: numeric("estimateValue", { precision: 10, scale: 2 }),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => [index("project_card_planning_cycle_idx").on(table.cycleId)],
).enableRLS();

export const projectCycleCards = pgTable(
  "project_cycle_card",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cycleId: bigint("cycleId", { mode: "number" })
      .notNull()
      .references(() => projectCycles.id, { onDelete: "restrict" }),
    cardId: bigint("cardId", { mode: "number" })
      .notNull()
      .references(() => cards.id, { onDelete: "restrict" }),
    estimateSnapshot: numeric("estimateSnapshot", {
      precision: 10,
      scale: 2,
    }),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
    removedAt: timestamp("removedAt"),
    completedAt: timestamp("completedAt"),
  },
  (table) => [
    index("project_cycle_card_cycle_idx").on(table.cycleId),
    index("project_cycle_card_card_idx").on(table.cardId),
    uniqueIndex("project_cycle_card_active_card_idx")
      .on(table.cardId)
      .where(sql`${table.removedAt} IS NULL`),
  ],
).enableRLS();
