import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { cards } from "./cards";
import { checklists } from "./checklists";
import { users } from "./users";

export const statusTypeEnum = pgEnum("statusType", [
  "pending",
  "done",
  "missed",
]);
export const taskPenaltyPriorityEnum = pgEnum("task_penalty_priority", [
  "high",
  "medium",
  "low",
]);
export const taskPenaltySourceEnum = pgEnum("task_penalty_source", [
  "system_default",
  "global_policy",
  "master_override",
]);
export const taskPenaltyAssessmentStatusEnum = pgEnum(
  "task_penalty_assessment_status",
  ["active", "voided"],
);
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
  dtStart: timestamp("dtStart", { withTimezone: true }), // Ngày bắt đầu tính nhịp
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
  startDate: timestamp("startDate", { withTimezone: true }).notNull(),
  endDate: timestamp("endDate", { withTimezone: true }).notNull(),
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
  priority: taskPenaltyPriorityEnum("priority"),
  publicId: varchar("publicId", { length: 12 }).unique(),
  penaltyOverrideAmountVnd: bigint("penaltyOverrideAmountVnd", {
    mode: "number",
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
    targetDate: timestamp("targetDate", { withTimezone: true }),
    actualDate: timestamp("actualDate", { withTimezone: true }),
    originalEndDate: timestamp("originalEndDate", { withTimezone: true }),
    endDate: timestamp("endDate", { withTimezone: true }),
    status: statusTypeEnum("status").notNull().default("pending"),
    penaltyPriority: taskPenaltyPriorityEnum("penaltyPriority"),
    penaltyAmountVnd: bigint("penaltyAmountVnd", { mode: "number" }),
    penaltySource: taskPenaltySourceEnum("penaltySource"),
    penaltyPolicyPublicId: varchar("penaltyPolicyPublicId", { length: 12 }),
    penaltySnapshottedAt: timestamp("penaltySnapshottedAt", {
      withTimezone: true,
    }),
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
    index("task_instances_status_deleted_end_idx").on(
      t.status,
      t.isDeleted,
      t.endDate,
    ),
    check(
      "task_instances_penalty_amount_safe_check",
      sql`${t.penaltyAmountVnd} IS NULL OR (${t.penaltyAmountVnd} >= 0 AND ${t.penaltyAmountVnd} <= 9007199254740991)`,
    ),
  ],
);

export const dailyTaskKpiExclusions = pgTable(
  "daily_task_kpi_exclusions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    taskMasterId: uuid("taskMasterId")
      .notNull()
      .references(() => taskMasters.id, { onDelete: "restrict" }),
    targetUserId: uuid("targetUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    occurrenceDate: date("occurrenceDate", { mode: "string" }).notNull(),
    reason: text("reason").notNull().default("Không áp dụng KPI cho task này."),
    excludedByUserId: uuid("excludedByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
    deletedByUserId: uuid("deletedByUserId").references(() => users.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    unique().on(t.taskMasterId, t.targetUserId, t.occurrenceDate),
    index("daily_task_kpi_exclusions_user_date_active_idx").on(
      t.targetUserId,
      t.occurrenceDate,
      t.deletedAt,
    ),
  ],
);

export const taskPenaltyPolicies = pgTable(
  "task_penalty_policies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    priority: taskPenaltyPriorityEnum("priority").notNull(),
    amountVnd: bigint("amountVnd", { mode: "number" }).notNull(),
    source: taskPenaltySourceEnum("source").notNull().default("global_policy"),
    effectiveFrom: timestamp("effectiveFrom", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effectiveTo", { withTimezone: true }),
    revision: integer("revision").notNull().default(1),
    supersededAt: timestamp("supersededAt", { withTimezone: true }),
    supersededBy: uuid("supersededBy").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_penalty_policy_priority_effective_idx").on(
      t.priority,
      t.effectiveFrom,
    ),
    index("task_penalty_policy_priority_revision_idx").on(
      t.priority,
      t.revision,
    ),
    check(
      "task_penalty_policy_amount_safe_check",
      sql`${t.amountVnd} >= 0 AND ${t.amountVnd} <= 9007199254740991`,
    ),
  ],
);

export const taskMasterPenaltyPolicies = pgTable(
  "task_master_penalty_policies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    taskMasterId: uuid("taskMasterId")
      .notNull()
      .references(() => taskMasters.id, { onDelete: "restrict" }),
    priority: taskPenaltyPriorityEnum("priority"),
    overrideAmountVnd: bigint("overrideAmountVnd", { mode: "number" }),
    effectiveFrom: timestamp("effectiveFrom", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effectiveTo", { withTimezone: true }),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_master_penalty_policy_master_effective_idx").on(
      t.taskMasterId,
      t.effectiveFrom,
    ),
    check(
      "task_master_penalty_policy_override_safe_check",
      sql`${t.overrideAmountVnd} IS NULL OR (${t.overrideAmountVnd} >= 0 AND ${t.overrideAmountVnd} <= 9007199254740991)`,
    ),
  ],
);

export const taskPenaltyAssessments = pgTable(
  "task_penalty_assessments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    taskInstanceId: uuid("taskInstanceId")
      .notNull()
      .references(() => taskInstances.id, { onDelete: "restrict" })
      .unique(),
    amountVnd: bigint("amountVnd", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("VND"),
    source: taskPenaltySourceEnum("source").notNull(),
    policyPublicId: varchar("policyPublicId", { length: 12 }),
    assessedAt: timestamp("assessedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: taskPenaltyAssessmentStatusEnum("status")
      .notNull()
      .default("active"),
    voidedAt: timestamp("voidedAt", { withTimezone: true }),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_penalty_assessment_instance_idx").on(t.taskInstanceId),
    check(
      "task_penalty_assessment_amount_safe_check",
      sql`${t.amountVnd} >= 0 AND ${t.amountVnd} <= 9007199254740991`,
    ),
  ],
);

export const taskInstanceExtensions = pgTable(
  "task_instance_extensions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    taskInstanceId: uuid("taskInstanceId")
      .notNull()
      .references(() => taskInstances.id, { onDelete: "restrict" }),
    previousEndDate: timestamp("previousEndDate", {
      withTimezone: true,
    }).notNull(),
    newEndDate: timestamp("newEndDate", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    extendedBy: uuid("extendedBy")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_instance_extensions_instance_created_idx").on(
      t.taskInstanceId,
      t.createdAt,
    ),
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
  penaltyPolicies: many(taskMasterPenaltyPolicies),
}));

export const taskInstanceRelations = relations(
  taskInstances,
  ({ one, many }) => ({
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
    extensions: many(taskInstanceExtensions),
    penaltyAssessment: one(taskPenaltyAssessments),
  }),
);

export const taskPenaltyPolicyRelations = relations(
  taskPenaltyPolicies,
  ({ one }) => ({
    createdByUser: one(users, {
      fields: [taskPenaltyPolicies.createdBy],
      references: [users.id],
    }),
  }),
);

export const taskMasterPenaltyPolicyRelations = relations(
  taskMasterPenaltyPolicies,
  ({ one }) => ({
    taskMaster: one(taskMasters, {
      fields: [taskMasterPenaltyPolicies.taskMasterId],
      references: [taskMasters.id],
    }),
  }),
);

export const taskPenaltyAssessmentRelations = relations(
  taskPenaltyAssessments,
  ({ one }) => ({
    taskInstance: one(taskInstances, {
      fields: [taskPenaltyAssessments.taskInstanceId],
      references: [taskInstances.id],
    }),
  }),
);

export const taskInstanceExtensionRelations = relations(
  taskInstanceExtensions,
  ({ one }) => ({
    taskInstance: one(taskInstances, {
      fields: [taskInstanceExtensions.taskInstanceId],
      references: [taskInstances.id],
    }),
    extendedByUser: one(users, {
      fields: [taskInstanceExtensions.extendedBy],
      references: [users.id],
    }),
  }),
);

export const fileActivityLogRelations = relations(
  fileActivityLog,
  ({ one }) => ({
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
  }),
);
