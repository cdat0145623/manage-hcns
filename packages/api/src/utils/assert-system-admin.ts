import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { users } from "@kan/db/schema";

export const assertSystemAdminRole = (user: { role?: string } | null | undefined) => {
  if (user?.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
};

/** Enforce the single system-admin policy shared by admin-only routers. */
export const assertSystemAdmin = async (db: dbClient, userId: string) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });

  assertSystemAdminRole(user);
};
