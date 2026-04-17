import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  decimal,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  text,
  boolean,
} from "drizzle-orm/pg-core";

import { cards } from "./cards";
import { users } from "./users";

export const rewardApprovalStatusEnum = pgEnum("rewardApprovalStatus", [
  "draft",
  "waiting_approval",
  "approved",
  "rejected",
  "waiting_evaluation",
  "completed"
]);
export const rewardTypeEnum = pgEnum("rewardType", ["project", "responsibility"]);
export const deductionUnitEnum = pgEnum("deductionUnit", ["percent", "vnd"]);
export const rewardViolationTypeEnum = pgEnum("rewardViolationType", [
  "deadline_extended",
  "deadline_shortened",
  "start_date_changed",
  "assignee_changed",
  "reward_config_changed",
  "deduction_changed",
  "finalization_created",
]);

export const cardRewardConfigs = pgTable("card_reward_configs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  cardId: bigint("cardId", { mode: "number" }).notNull().unique().references(() => cards.id, { onDelete: "no action", onUpdate: "no action" }),
  rewardType: rewardTypeEnum("rewardType").notNull(),
  bonusAmount: decimal("bonusAmount", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("VND").notNull(),

  approvalStatus: rewardApprovalStatusEnum("approvalStatus").default("draft").notNull(),
  approvedBy: uuid("approvedBy").references(() => users.id, { onUpdate: "no action" }),
  approvedAt: timestamp("approvedAt", { precision: 6 }),
  rejectedReason: text("rejectedReason"),

  createdBy: uuid("createdBy").notNull().references(() => users.id, { onUpdate: "no action" }),
  createdAt: timestamp("createdAt", { precision: 6 }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { precision: 6 }),
});

export const cardRewardDeductions = pgTable("card_reward_deductions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  configId: bigint("configId", { mode: "number" }).notNull().references(() => cardRewardConfigs.id, { onDelete: "cascade", onUpdate: "no action" }),
  reason: varchar("reason", { length: 500 }).notNull(),
  unitType: deductionUnitEnum("unitType").notNull(),
  value: decimal("value", { precision: 15, scale: 2 }).notNull(),
  displayOrder: integer("displayOrder").default(0).notNull(),
  createdAt: timestamp("createdAt", { precision: 6 }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { precision: 6 }),
});

export const cardRewardSnapshots = pgTable("card_reward_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  configId: bigint("configId", { mode: "number" }).notNull().unique().references(() => cardRewardConfigs.id, { onUpdate: "no action" }),
  
  snappedCardTitle: text("snappedCardTitle").notNull(),
  snappedStartDate: timestamp("snappedStartDate", { precision: 6 }),
  snappedDueDate: timestamp("snappedDueDate", { precision: 6 }),
  snappedTargetUser: uuid("snappedTargetUser"),
  
  snappedRewardType: rewardTypeEnum("snappedRewardType").notNull(),
  snappedBonusAmount: decimal("snappedBonusAmount", { precision: 15, scale: 2 }),
  snappedCurrency: varchar("snappedCurrency", { length: 3 }).notNull(),
  
  snappedDeductions: jsonb("snappedDeductions").notNull(),
  
  snapshotAt: timestamp("snapshotAt", { precision: 6 }).defaultNow().notNull(),
  snapshotBy: uuid("snapshotBy").notNull().references(() => users.id, { onUpdate: "no action" }),
});

export const cardRewardLogs = pgTable("card_reward_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  configId: bigint("configId", { mode: "number" }).notNull().references(() => cardRewardConfigs.id, { onUpdate: "no action" }),
  deductionId: bigint("deductionId", { mode: "number" }).references(() => cardRewardDeductions.id, { onDelete: "set null", onUpdate: "no action" }),
  violationType: rewardViolationTypeEnum("violationType").notNull(),
  beforeValue: jsonb("beforeValue").notNull(),
  afterValue: jsonb("afterValue").notNull(),
  detectedAt: timestamp("detectedAt", { precision: 6 }).defaultNow().notNull(),
  isSkipped: boolean("isSkipped").default(false).notNull(),
});

export const cardRewardFinalizations = pgTable("card_reward_finalizations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  configId: bigint("configId", { mode: "number" }).notNull().unique().references(() => cardRewardConfigs.id, { onUpdate: "no action" }),
  completionPercent: decimal("completionPercent", { precision: 5, scale: 2 }).notNull(),
  suggestedAmount: decimal("suggestedAmount", { precision: 15, scale: 2 }).notNull(),
  finalAmount: decimal("finalAmount", { precision: 15, scale: 2 }).notNull(),
  finalNote: text("finalNote"),
  finalizedBy: uuid("finalizedBy").notNull().references(() => users.id, { onUpdate: "no action" }),
  finalizedAt: timestamp("finalizedAt", { precision: 6 }).defaultNow().notNull(),
});

export const cardRewardConfigsRelations = relations(cardRewardConfigs, ({ one, many }) => ({
  card: one(cards, {
    fields: [cardRewardConfigs.cardId],
    references: [cards.id],
    relationName: "rewardConfigsCard"
  }),
  userApprovedBy: one(users, {
    fields: [cardRewardConfigs.approvedBy],
    references: [users.id],
    relationName: "rewardConfigsApprovedBy"
  }),
  userCreatedBy: one(users, {
    fields: [cardRewardConfigs.createdBy],
    references: [users.id],
    relationName: "rewardConfigsCreatedBy"
  }),
  deductions: many(cardRewardDeductions),
  snapshot: one(cardRewardSnapshots, {
    fields: [cardRewardConfigs.id],
    references: [cardRewardSnapshots.configId],
    relationName: "rewardConfigsSnapshot"
  }),
  logs: many(cardRewardLogs),
  finalization: one(cardRewardFinalizations, {
    fields: [cardRewardConfigs.id],
    references: [cardRewardFinalizations.configId],
    relationName: "rewardConfigsFinalization"
  })
}));

export const cardRewardDeductionsRelations = relations(cardRewardDeductions, ({ one }) => ({
  config: one(cardRewardConfigs, {
    fields: [cardRewardDeductions.configId],
    references: [cardRewardConfigs.id],
    relationName: "rewardDeductionsConfig"
  })
}));

export const cardRewardSnapshotsRelations = relations(cardRewardSnapshots, ({ one }) => ({
  config: one(cardRewardConfigs, {
    fields: [cardRewardSnapshots.configId],
    references: [cardRewardConfigs.id],
    relationName: "rewardConfigsSnapshot"
  }),
  snapshotBy: one(users, {
    fields: [cardRewardSnapshots.snapshotBy],
    references: [users.id],
    relationName: "rewardSnapshotsSnapshotBy"
  })
}));

export const cardRewardLogsRelations = relations(cardRewardLogs, ({ one }) => ({
  config: one(cardRewardConfigs, {
    fields: [cardRewardLogs.configId],
    references: [cardRewardConfigs.id],
    relationName: "rewardLogsConfig"
  }),
  deduction: one(cardRewardDeductions, {
    fields: [cardRewardLogs.deductionId],
    references: [cardRewardDeductions.id],
    relationName: "rewardLogsDeduction"
  })
}));

export const cardRewardFinalizationsRelations = relations(cardRewardFinalizations, ({ one }) => ({
  config: one(cardRewardConfigs, {
    fields: [cardRewardFinalizations.configId],
    references: [cardRewardConfigs.id],
    relationName: "rewardConfigsFinalization"
  }),
  finalizedBy: one(users, {
    fields: [cardRewardFinalizations.finalizedBy],
    references: [users.id],
    relationName: "rewardFinalizationsFinalizedBy"
  })
}));
