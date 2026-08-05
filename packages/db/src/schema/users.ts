import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  bigint,
} from "drizzle-orm/pg-core";

import { apikey } from "./auth";
import { boards, userBoardFavorites } from "./boards";
import { cards } from "./cards";
import { imports } from "./imports";
import { lists } from "./lists";
import { workspaceMembers, workspaces, memberRoleEnum } from "./workspaces";
import { integrations } from "./integrations";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: uuid("id")
    .notNull()
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique(),
  username: text("username").unique(),
  password: text("password"),
  accountId: text("account_id"),
  providerId: text("provider_id"),
  userId: text("user_id"),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: varchar("image", { length: 255 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  role: memberRoleEnum("role").notNull().default("NVVP"),
  branchId: integer("branchId"),
  areaId: integer("areaId"),
  isActive: boolean("isActive").notNull().default(true),
  positionId: bigint("positionId", { mode: "number" }).references(
    (): AnyPgColumn => positions.id,
    { onDelete: "restrict" },
  ),
}).enableRLS();

import { positions } from "./positions";

export const usersRelations = relations(users, ({ many, one }) => ({
  deletedBoards: many(boards, {
    relationName: "boardDeletedByUser",
  }),
  boards: many(boards, {
    relationName: "boardCreatedByUser",
  }),
  ownedBoards: many(boards, {
    relationName: "boardOwnerUser",
  }),
  deletedCards: many(cards, {
    relationName: "cardsDeletedByUser",
  }),
  cards: many(cards, {
    relationName: "cardsCreatedByUser",
  }),
  imports: many(imports),
  deletedLists: many(lists, {
    relationName: "listsDeletedByUser",
  }),
  lists: many(lists, {
    relationName: "listsCreatedByUser",
  }),
  deletedWorkspaces: many(workspaces, {
    relationName: "workspaceDeletedByUser",
  }),
  workspaces: many(workspaces, {
    relationName: "workspaceCreatedByUser",
  }),
  apiKeys: many(apikey),
  integrations: many(integrations),
  position: one(positions, {
    fields: [users.positionId],
    references: [positions.id],
  }),
}));

export const usersToWorkspacesRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    addedBy: one(users, {
      fields: [workspaceMembers.createdBy],
      references: [users.id],
      relationName: "usersToWorkspacesAddedByUser",
    }),
    deletedBy: one(users, {
      fields: [workspaceMembers.deletedBy],
      references: [users.id],
      relationName: "usersToWorkspacesDeletedByUser",
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
      relationName: "usersToWorkspacesUser",
    }),
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
      relationName: "usersToWorkspacesWorkspace",
    }),
  }),
);

export const userBoardFavoritesRelations = relations(userBoardFavorites, ({ one }) => ({
  user: one(users, {
    fields: [userBoardFavorites.userId],
    references: [users.id],
  }),
  board: one(boards, {
    fields: [userBoardFavorites.boardId],
    references: [boards.id],
  }),
}));
