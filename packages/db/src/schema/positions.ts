import { AnyPgColumn } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

import { pgTable, bigserial, varchar, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const positions = pgTable("position", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: uuid("createdBy").references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: uuid("deletedBy").references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
}).enableRLS();

import { users } from "./users";

export const positionsRelations = relations(positions, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [positions.createdBy],
    references: [users.id],
    relationName: "positionCreatedByUser",
  }),
  deletedBy: one(users, {
    fields: [positions.deletedBy],
    references: [users.id],
    relationName: "positionDeletedByUser",
  }),
  users: many(users),
}));