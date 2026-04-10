import { TRPCError } from "@trpc/server";

import type { dbClient } from "@kan/db/client";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import type { Role } from "@kan/shared";

export async function assertUserInWorkspace(
  db: dbClient,
  userId: string,
  workspaceId: number,
  role?: Role,
) {
  const isMember = await workspaceRepo.isUserInWorkspace(
    db,
    userId,
    workspaceId,
    role,
  );

  if (!isMember)
    throw new TRPCError({
      message: `You do not have access to this workspace`,
      code: "FORBIDDEN",
    });
}
