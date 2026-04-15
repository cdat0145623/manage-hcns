import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import { createTRPCRouter, publicProcedure } from "../trpc";

export const workspacePublicRouter = createTRPCRouter({
  all: publicProcedure
      .meta({
        openapi: {
          summary: "Get all workspaces",
          method: "GET",
          path: "/workspaces",
          description: "Retrieves all workspaces for the authenticated user",
          tags: ["Workspaces"],
          protect: true,
        },
      })
      .input(z.void())
      .output(
        z.custom<Awaited<ReturnType<typeof workspaceRepo.getAllForPublic>>>(),
      )
      .query(async ({ ctx }) => {
        const result = await workspaceRepo.getAllForPublic(ctx.db);
  
        return result;
      }),
});