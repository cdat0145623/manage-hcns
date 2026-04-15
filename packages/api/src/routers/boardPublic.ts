import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as boardRepo from "@kan/db/repository/board.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import { createTRPCRouter, publicProcedure } from "../trpc";

export const boardPublicRouter = createTRPCRouter({
  all: publicProcedure
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        type: z.enum(["regular", "template"]).optional(),
        archived: z.boolean().optional(),
      }),
    )
    .output(
      z.custom<Awaited<ReturnType<typeof boardRepo.getAllForPublic>>>(),
    )
    .query(async ({ ctx, input }) => {
      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace)
        throw new TRPCError({
          message: `Workspace with public ID ${input.workspacePublicId} not found`,
          code: "NOT_FOUND",
        });

      const result = await boardRepo.getAllForPublic(
        ctx.db,
        workspace.id,
        {
          type: input.type,
          archived: input.archived ?? false,
        },
      );

      return result;
    }),
});