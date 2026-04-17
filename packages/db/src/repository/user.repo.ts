import { count, desc, eq, or } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import type { dbClient } from "@kan/db/client";
import { apikey, users, workspaceMembers } from "@kan/db/schema";
import { memberRoles } from "@kan/db/schema";

export type UserRole = (typeof memberRoles)[number];

export const getCount = async (db: dbClient) => {
  const result = await db.select({ count: count() }).from(users);

  return result[0]?.count ?? 0;
};

export const getById = async (db: dbClient, userId: string) => {
  return await db.query.users.findFirst({
    columns: {
      id: true,
      name: true,
      email: true,
      username: true,
      image: true,
      stripeCustomerId: true,
      role: true,
    },
    with: {
      apiKeys: {
        columns: {
          id: true,
          prefix: true,
          key: true,
        },
        orderBy: desc(apikey.createdAt),
        limit: 1,
      },
    },
    where: eq(users.id, userId),
  });
};

export const getByStripeCustomerId = async (
  db: dbClient,
  stripeCustomerId: string,
) => {
  return await db.query.users.findFirst({
    where: eq(users.stripeCustomerId, stripeCustomerId),
  });
};

export const getByEmail = (db: dbClient, email: string) => {
  return db.query.users.findFirst({
    columns: {
      id: true,
      name: true,
      email: true,
      username: true,
    },
    where: eq(users.email, email),
  });
};

export const getByUsername = (db: dbClient, username: string) => {
  return db.query.users.findFirst({
    columns: {
      id: true,
      name: true,
      email: true,
      username: true,
    },
    where: eq(users.username, username),
  });
};

export const create = async (
  db: dbClient,
  user: {
    name?: string | null;
    email?: string | null;
    username?: string | null;
    password?: string | null;
    stripeCustomerId?: string;
    role: UserRole;
  },
) => {
  const [result] = await db
    .insert(users)
    .values({
      name: user.name,
      email: user.email,
      username: user.username,
      password: user.password,
      stripeCustomerId: user.stripeCustomerId,
      emailVerified: true,
      role: user.role,
    })
    .returning();

  return result;
};

export const update = async (
  db: dbClient,
  userId: string,
  updates: {
    image?: string;
    name?: string;
    email?: string;
    username?: string;
    password?: string;
    stripeCustomerId?: string;
  },
) => {
  const [result] = await db
    .update(users)
    .set({
      name: updates.name,
      image: updates.image,
      email: updates.email,
      username: updates.username,
      password: updates.password,
      stripeCustomerId: updates.stripeCustomerId,
    })
    .where(eq(users.id, userId))
    .returning({
      name: users.name,
      image: users.image,
      email: users.email,
      username: users.username,
      stripeCustomerId: users.stripeCustomerId,
    });

  return result;
};

export const updateEmailInWorkspaceMembers = async (
  db: dbClient,
  userId: string,
  newEmail: string,
) => {
  await db
    .update(workspaceMembers)
    .set({ email: newEmail })
    .where(eq(workspaceMembers.userId, userId));
};

export const updateStatus = async (db: dbClient, userId: string, isActive: boolean) => {
  const [result] = await db
    .update(users)
    .set({ isActive })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      isActive: users.isActive,
    });

  return result;
};

export const getAll = async (db: dbClient) => {
  return await db.query.users.findMany({
    columns: {
      id: true,
      name: true,
      email: true,
      username: true,
      role: true,
    },
    where: or(
      eq(users.role, "BRANCH_MANAGER"),
      eq(users.role, "NVVP"),
      eq(users.role, "AREA_MANAGER"),
    ),
  });
};

export const getAllForPublic = async (db: dbClient) => {
  return await db.query.users.findMany({
    columns: {
      id: true,
      name: true,
      email: true,
      username: true,
      role: true,
    },
    with: {
      position: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
    where: eq(users.isActive, true),
  });
};

export const updatePosition = async (db: dbClient, userId: string, positionId: number) => {
  const [result] = await db
    .update(users)
    .set({ positionId })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      positionId: users.positionId,
    });

  return result;
};